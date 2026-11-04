import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';
import { Field, inputClass } from '@/shared/ui/Field';
import { Modal } from '@/shared/ui/Modal';
import {
  type RosterListResponse,
  type RosterMember,
  type RosterMemberFields,
} from '@/features/roster/rosterApi';
import type { CustomRank } from '@/features/roster/rosterApi';

const schema = z.object({
  fullNameEn: z.string().trim().min(1),
  fullNameAr: z.string().trim(),
  customRankId: z.string(),
  status: z.enum(['Active', 'Suspended']),
});

type EditValues = z.infer<typeof schema>;

export interface EditMemberSaveFields {
  fullNameEn: string;
  fullNameAr: string | null;
  customRankId: string | null;
  status: 'Active' | 'Suspended';
}

export function EditMemberDialog({
  member,
  roster,
  ranks,
  pending,
  error,
  onSave,
  onCreateCompany,
  onResetPassword,
  resetPasswordPending,
  resetPasswordError,
  resetPasswordSuccess,
  onOpenChange,
}: {
  member: RosterMember | null;
  roster: RosterListResponse;
  ranks: CustomRank[];
  pending: boolean;
  error: boolean;
  onSave: (fields: EditMemberSaveFields) => void;
  onCreateCompany: (name: string) => Promise<{ id: string; name: string }>;
  onResetPassword: (newPassword: string) => Promise<void>;
  resetPasswordPending: boolean;
  resetPasswordError: boolean;
  resetPasswordSuccess: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const [newCompanyName, setNewCompanyName] = useState('');
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [createCompanyError, setCreateCompanyError] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showCompanySection, setShowCompanySection] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<EditValues>({ resolver: zodResolver(schema), defaultValues: emptyValues() });

  useEffect(() => {
    reset(member ? valuesFor(member) : emptyValues());
    setShowReset(false);
    setNewPassword('');
    setShowCompanySection(false);
  }, [member, reset]);

  const submit = (values: EditValues) => {
    onSave({
      fullNameEn: values.fullNameEn,
      fullNameAr: values.fullNameAr || null,
      customRankId: values.customRankId || null,
      status: values.status,
    });
  };

  return (
    <Modal
      open={member !== null}
      onOpenChange={onOpenChange}
      size="lg"
      title={t('roster.edit.title')}
      description={t('roster.edit.description')}
    >
      <form onSubmit={handleSubmit(submit)} noValidate className="flex flex-col gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="edit-name-en" label={t('roster.edit.nameEn')} error={errors.fullNameEn && t('roster.edit.nameRequired')}>
            <input id="edit-name-en" className={inputClass} {...register('fullNameEn')} />
          </Field>
          <Field id="edit-name-ar" label={t('roster.edit.nameAr')}>
            <input id="edit-name-ar" dir="auto" className={inputClass} {...register('fullNameAr')} />
          </Field>
          <Field id="edit-rank" label={t('roster.edit.rank')}>
            <select id="edit-rank" className={inputClass} {...register('customRankId')}>
              <option value="">{t('roster.import.noRank')}</option>
              {ranks.map((rank) => (
                <option key={rank.id} value={rank.id}>
                  {rank.nameAr ?? rank.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id="edit-status" label={t('roster.edit.status')}>
            <select id="edit-status" className={inputClass} {...register('status')}>
              <option value="Active">{t('roster.status.Active')}</option>
              <option value="Suspended">{t('roster.status.Suspended')}</option>
            </select>
          </Field>
        </div>

        {member && member.canManage && (
          <div className="border-t border-neutral-200 pt-4">
            <button
              type="button"
              onClick={() => setShowCompanySection((v) => !v)}
              className="text-sm font-medium text-primary-700 hover:text-primary-800"
            >
              {t('roster.edit.companyAssignment')}
            </button>
            {showCompanySection && (
              <CompanySection
                roster={roster}
                newCompanyName={newCompanyName}
                setNewCompanyName={setNewCompanyName}
                creatingCompany={creatingCompany}
                createCompanyError={createCompanyError}
                onCreateCompany={async (name) => {
                  setCreatingCompany(true);
                  setCreateCompanyError(false);
                  try {
                    await onCreateCompany(name);
                    setNewCompanyName('');
                  } catch {
                    setCreateCompanyError(true);
                  } finally {
                    setCreatingCompany(false);
                  }
                }}
              />
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">
            {t('roster.edit.saveFailed')}
          </p>
        )}
        {member && member.canManage && (
          <div className="border-t border-neutral-200 pt-4">
            {!showReset ? (
              <button
                type="button"
                onClick={() => setShowReset(true)}
                className="text-sm font-medium text-primary-700 hover:text-primary-800"
              >
                {t('roster.edit.resetPassword')}
              </button>
            ) : (
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-sm text-neutral-600">{t('roster.edit.resetPasswordDescription')}</p>
                </div>
                <Field id="reset-password" label={t('roster.edit.newPassword')}>
                  <input
                    id="reset-password"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder={t('roster.edit.newPasswordPlaceholder')}
                    className={inputClass}
                    autoComplete="new-password"
                  />
                </Field>
                {resetPasswordError && (
                  <p role="alert" className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">
                    {t('roster.edit.resetFailed')}
                  </p>
                )}
                {resetPasswordSuccess && (
                  <p role="status" className="rounded-lg bg-success-50 px-3 py-2 text-sm text-success-700">
                    {t('roster.edit.resetSuccess')}
                  </p>
                )}
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => { setShowReset(false); setNewPassword(''); }}
                    disabled={resetPasswordPending}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    type="button"
                    disabled={resetPasswordPending || newPassword.length < 8}
                    onClick={async () => {
                      await onResetPassword(newPassword);
                      setNewPassword('');
                    }}
                  >
                    {resetPasswordPending ? t('roster.edit.resetting') : t('roster.edit.resetButton')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={pending} className="w-full sm:w-auto">
            {pending ? t('roster.edit.saving') : t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CompanySection({
  roster,
  newCompanyName,
  setNewCompanyName,
  creatingCompany,
  createCompanyError,
  onCreateCompany,
}: {
  roster: RosterListResponse;
  newCompanyName: string;
  setNewCompanyName: (v: string) => void;
  creatingCompany: boolean;
  createCompanyError: boolean;
  onCreateCompany: (name: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-3 flex flex-col gap-2">
      <p className="text-xs text-neutral-500">{t('roster.edit.companyHint')}</p>
      <div className="flex gap-2">
        <input
          value={newCompanyName}
          onChange={(event) => setNewCompanyName(event.target.value)}
          placeholder={t('roster.edit.newCompany')}
          className={`${inputClass} min-w-0 flex-1`}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={creatingCompany || !newCompanyName.trim()}
          onClick={() => void onCreateCompany(newCompanyName.trim())}
        >
          {creatingCompany ? t('roster.edit.creatingCompany') : t('roster.edit.addCompany')}
        </Button>
      </div>
      {createCompanyError && <p className="mt-1 text-xs text-error-700">{t('roster.edit.companyCreateFailed')}</p>}
    </div>
  );
}

function emptyValues(): EditValues {
  return { fullNameEn: '', fullNameAr: '', customRankId: '', status: 'Active' };
}

function valuesFor(member: RosterMember): EditValues {
  return {
    fullNameEn: member.fullNameEn,
    fullNameAr: member.fullNameAr ?? '',
    customRankId: member.customRankId ?? '',
    status: member.status,
  };
}
