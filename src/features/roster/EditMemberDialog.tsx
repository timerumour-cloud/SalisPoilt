import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';
import { Field, inputClass } from '@/shared/ui/Field';
import { Modal } from '@/shared/ui/Modal';
import {
  ROLE_CODES,
  type RosterListResponse,
  type RosterMember,
  type RosterMemberFields,
} from '@/features/roster/rosterApi';

const schema = z.object({
  fullNameEn: z.string().trim().min(1),
  fullNameAr: z.string().trim(),
  role: z.enum(ROLE_CODES),
  companyId: z.string(),
  branchId: z.string(),
  teamId: z.string(),
  status: z.enum(['Active', 'Suspended']),
});

type EditValues = z.infer<typeof schema>;

export function EditMemberDialog({
  member,
  roster,
  pending,
  error,
  onSave,
  onCreateCompany,
  onOpenChange,
}: {
  member: RosterMember | null;
  roster: RosterListResponse;
  pending: boolean;
  error: boolean;
  onSave: (fields: RosterMemberFields) => void;
  onCreateCompany: (name: string) => Promise<{ id: string; name: string }>;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const [newCompanyName, setNewCompanyName] = useState('');
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [createCompanyError, setCreateCompanyError] = useState(false);
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
  }, [member, reset]);

  const companyId = watch('companyId');
  const branchId = watch('branchId');
  const branches = useMemo(
    () => roster.lookups.branches.filter((branch) => branch.company_id === companyId),
    [roster.lookups.branches, companyId]
  );
  const teams = useMemo(
    () => roster.lookups.teams.filter((team) => team.branch_id === branchId),
    [roster.lookups.teams, branchId]
  );

  const submit = (values: EditValues) => {
    onSave({
      fullNameEn: values.fullNameEn,
      fullNameAr: values.fullNameAr || null,
      role: values.role,
      status: values.status,
      companyId: values.companyId || null,
      branchId: values.branchId || null,
      teamId: values.teamId || null,
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
          <Field id="edit-role" label={t('roster.edit.rank')}>
            <select id="edit-role" className={inputClass} {...register('role')}>
              {roster.assignableRoles.map((role) => (
                <option key={role} value={role}>
                  {t(`roles.${role}`)}
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
          <Field id="edit-company" label={t('roster.edit.company')}>
            <select
              id="edit-company"
              className={inputClass}
              {...register('companyId', {
                onChange: () => {
                  setValue('branchId', '');
                  setValue('teamId', '');
                },
              })}
            >
              <option value="">{t('common.none')}</option>
              {roster.lookups.companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
            <div className="mt-2 flex gap-2">
              <input value={newCompanyName} onChange={(event) => setNewCompanyName(event.target.value)} placeholder={t('roster.edit.newCompany')} className={`${inputClass} min-w-0 flex-1`} />
              <Button type="button" variant="secondary" disabled={creatingCompany || !newCompanyName.trim()} onClick={async () => {
                setCreatingCompany(true);
                setCreateCompanyError(false);
                try {
                  const company = await onCreateCompany(newCompanyName.trim());
                  setValue('companyId', company.id);
                  setValue('branchId', '');
                  setValue('teamId', '');
                  setNewCompanyName('');
                } catch {
                  setCreateCompanyError(true);
                } finally {
                  setCreatingCompany(false);
                }
              }}>{creatingCompany ? t('roster.edit.creatingCompany') : t('roster.edit.addCompany')}</Button>
            </div>
            {createCompanyError && <p className="mt-1 text-xs text-error-700">{t('roster.edit.companyCreateFailed')}</p>}
          </Field>
          <Field id="edit-branch" label={t('roster.edit.branch')}>
            <select
              id="edit-branch"
              className={inputClass}
              disabled={!companyId}
              {...register('branchId', { onChange: () => setValue('teamId', '') })}
            >
              <option value="">{t('common.none')}</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id="edit-team" label={t('roster.edit.team')} className="sm:col-span-2">
            <select id="edit-team" className={inputClass} disabled={!branchId} {...register('teamId')}>
              <option value="">{t('common.none')}</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">
            {t('roster.edit.saveFailed')}
          </p>
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

function emptyValues(): EditValues {
  return { fullNameEn: '', fullNameAr: '', role: 'EMPLOYEE', companyId: '', branchId: '', teamId: '', status: 'Active' };
}

function valuesFor(member: RosterMember): EditValues {
  return {
    fullNameEn: member.fullNameEn,
    fullNameAr: member.fullNameAr ?? '',
    role: member.role,
    companyId: member.companyId ?? '',
    branchId: member.branchId ?? '',
    teamId: member.teamId ?? '',
    status: member.status,
  };
}
