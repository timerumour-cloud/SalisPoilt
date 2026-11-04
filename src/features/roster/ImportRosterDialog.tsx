import { useRef, useState, type ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import {
  commitRosterImport,
  previewRosterImport,
  RosterError,
  type RosterImportPreview,
  type RosterImportResult,
  type RosterValidationIssue,
} from '@/features/roster/rosterApi';
import { readRosterFile, type RosterFileRow } from '@/features/roster/rosterSheet';
import { provisionRosterAccounts, type ProvisionReport } from '@/features/roster/provisionRosterAccounts';

type Stage =
  | { kind: 'choose' }
  | { kind: 'working'; label: 'reading' | 'checking' }
  | { kind: 'ready'; rows: RosterFileRow[]; preview: RosterImportPreview }
  | { kind: 'invalid'; issues: RosterValidationIssue[] }
  | { kind: 'importing'; rows: RosterFileRow[]; done: number }
  | { kind: 'done'; result: RosterImportResult; accounts: ProvisionReport; total: number }
  | { kind: 'error'; reason: 'unreadable' | 'empty' | 'failed' };

const MAX_LISTED_ISSUES = 20;

export function ImportRosterDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>({ kind: 'choose' });

  const reset = () => setStage({ kind: 'choose' });

  const handleOpenChange = (next: boolean) => {
    if (!next && stage.kind === 'importing') return;
    if (!next) reset();
    onOpenChange(next);
  };

  const checkFile = async (file: File) => {
    setStage({ kind: 'working', label: 'reading' });
    let rows: RosterFileRow[];
    try {
      rows = await readRosterFile(file);
    } catch {
      setStage({ kind: 'error', reason: 'unreadable' });
      return;
    }
    if (rows.length === 0) {
      setStage({ kind: 'error', reason: 'empty' });
      return;
    }
    setStage({ kind: 'working', label: 'checking' });
    try {
      const preview = await previewRosterImport(rows.map((entry) => entry.row));
      setStage({ kind: 'ready', rows, preview });
    } catch (error) {
      if (error instanceof RosterError && error.code === 'validation' && Array.isArray(error.details)) {
        setStage({ kind: 'invalid', issues: error.details as RosterValidationIssue[] });
      } else {
        setStage({ kind: 'error', reason: 'failed' });
      }
    }
  };

  const runImport = async (rows: RosterFileRow[]) => {
    setStage({ kind: 'importing', rows, done: 0 });
    try {
      const result = await commitRosterImport(rows.map((entry) => entry.row));
      const accounts = await provisionRosterAccounts(rows, (done) =>
        setStage((current) => (current.kind === 'importing' ? { ...current, done } : current))
      );
      await queryClient.invalidateQueries({ queryKey: ['roster'] });
      setStage({ kind: 'done', result, accounts, total: rows.length });
    } catch {
      await queryClient.invalidateQueries({ queryKey: ['roster'] });
      setStage({ kind: 'error', reason: 'failed' });
    }
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void checkFile(file);
  };

  return (
    <Modal
      open={open}
      onOpenChange={handleOpenChange}
      size="lg"
      title={t('roster.import.title')}
      description={t('roster.import.description')}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={onFileChange}
      />
      {stage.kind === 'choose' && <ChooseStep onPick={() => inputRef.current?.click()} />}
      {stage.kind === 'working' && (
        <p role="status" className="py-8 text-center text-sm text-neutral-600">
          {t(`roster.import.working.${stage.label}`)}
        </p>
      )}
      {stage.kind === 'ready' && (
        <ReadyStep
          count={stage.rows.length}
          preview={stage.preview}
          onImport={() => void runImport(stage.rows)}
          onChooseAnother={() => inputRef.current?.click()}
        />
      )}
      {stage.kind === 'invalid' && (
        <InvalidStep issues={stage.issues} onChooseAnother={() => inputRef.current?.click()} />
      )}
      {stage.kind === 'importing' && (
        <p role="status" className="py-8 text-center text-sm text-neutral-600">
          {stage.done === 0
            ? t('roster.import.importing')
            : t('roster.import.accountProgress', { done: stage.done, total: stage.rows.length })}
        </p>
      )}
      {stage.kind === 'done' && (
        <DoneStep
          result={stage.result}
          accounts={stage.accounts}
          onClose={() => handleOpenChange(false)}
        />
      )}
      {stage.kind === 'error' && (
        <div className="flex flex-col gap-4">
          <p role="alert" className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">
            {t(`roster.import.errors.${stage.reason}`)}
          </p>
          <Button variant="secondary" onClick={() => inputRef.current?.click()} className="w-full sm:w-auto">
            {t('roster.import.chooseAnother')}
          </Button>
        </div>
      )}
    </Modal>
  );
}

function formatIssue(t: TFunction, issue: RosterValidationIssue): string {
  const message = t(`roster.import.issues.${issue.code}`, { defaultValue: issue.code });
  return t('roster.import.issue', { line: issue.line, code: message });
}

function ChooseStep({ onPick }: { onPick: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-6 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-success-50 text-success-700">
        <FileSpreadsheet className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="max-w-sm text-sm text-neutral-600">{t('roster.import.chooseHint')}</p>
      <Button onClick={onPick}>{t('roster.import.chooseFile')}</Button>
    </div>
  );
}

function ReadyStep({
  count,
  preview,
  onImport,
  onChooseAnother,
}: {
  count: number;
  preview: RosterImportPreview;
  onImport: () => void;
  onChooseAnother: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-3 gap-3">
        <Stat label={t('roster.import.total')} value={count} />
        <Stat label={t('roster.import.toAdd')} value={preview.toCreate} />
        <Stat label={t('roster.import.toUpdate')} value={preview.toUpdate} />
      </div>
      <p className="text-sm text-neutral-600">{t('roster.import.passwordNote')}</p>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onChooseAnother} className="w-full sm:w-auto">
          {t('roster.import.chooseAnother')}
        </Button>
        <Button onClick={onImport} className="w-full sm:w-auto">
          {t('roster.import.commit', { count })}
        </Button>
      </div>
    </div>
  );
}

function InvalidStep({ issues, onChooseAnother }: { issues: RosterValidationIssue[]; onChooseAnother: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <p role="alert" className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">
        {t('roster.import.invalidIntro', { count: issues.length })}
      </p>
      <ul className="flex max-h-60 flex-col gap-2 overflow-y-auto text-sm text-neutral-700">
        {issues.slice(0, MAX_LISTED_ISSUES).map((issue, index) => (
          <li key={`${issue.line}-${issue.code}-${index}`} className="rounded-lg bg-neutral-50 px-3 py-2">
            {formatIssue(t, issue)}
          </li>
        ))}
      </ul>
      <Button variant="secondary" onClick={onChooseAnother} className="w-full sm:w-auto">
        {t('roster.import.chooseAnother')}
      </Button>
    </div>
  );
}

function DoneStep({
  result,
  accounts,
  onClose,
}: {
  result: RosterImportResult;
  accounts: ProvisionReport;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="rounded-lg bg-success-50 px-3 py-2 text-sm text-success-700">
        {t('roster.import.done', { created: result.created, updated: result.updated })}
      </p>
      <p className="text-sm text-neutral-700">
        {t('roster.import.accounts', { created: accounts.created, existing: accounts.existing })}
      </p>
      {accounts.failedLines.length > 0 && (
        <div role="alert" className="flex flex-col gap-2 rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-700">
          <p>{t('roster.import.accountsFailed', { lines: accounts.failedLines.join(', ') })}</p>
          {accounts.firstErrorCode && (
            <p className="font-medium">
              {t('roster.import.accountErrorReason', {
                defaultValue: '',
                reason: t(
                  `roster.import.accountErrors.${accounts.firstErrorCode}`,
                  { defaultValue: accounts.firstErrorCode }
                ),
              })}
            </p>
          )}
        </div>
      )}
      <Button onClick={onClose} className="w-full sm:w-auto sm:self-end">
        {t('common.close')}
      </Button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
      <p className="text-2xl font-semibold text-primary-900">{value}</p>
      <p className="text-xs text-neutral-600">{label}</p>
    </div>
  );
}
