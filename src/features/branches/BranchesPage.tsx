import { useState } from 'react';
import { GitBranch, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/features/auth/useAuth';
import { useRosterList, useCreateBranch } from '@/features/roster/useRoster';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorState } from '@/shared/ui/ErrorState';
import { Field, inputClass } from '@/shared/ui/Field';
import { Modal } from '@/shared/ui/Modal';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Skeleton } from '@/shared/ui/Skeleton';

export function BranchesPage() {
  const { t } = useTranslation();
  const { state } = useAuth();
  const member = state.status === 'ready' ? state.member : null;
  const rosterQuery = useRosterList(member?.id ?? '');
  const [addOpen, setAddOpen] = useState(false);

  if (!member || rosterQuery.isPending) return <Skeleton className="h-96 w-full" />;
  if (rosterQuery.isError) return <ErrorState onRetry={() => void rosterQuery.refetch()} />;

  const branches = rosterQuery.data?.lookups.branches ?? [];
  const companies = rosterQuery.data?.lookups.companies ?? [];
  const members = rosterQuery.data?.members ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('branchesPage.title')}
        description={t('branchesPage.description')}
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t('branchesPage.add')}
          </Button>
        }
      />
      {branches.length === 0 ? (
        <Card>
          <EmptyState
            icon={<GitBranch className="h-7 w-7" aria-hidden="true" />}
            title={t('branchesPage.emptyTitle')}
            body={t('branchesPage.emptyBody')}
          />
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {branches.map((branch) => {
            const companyName = companies.find((c) => c.id === branch.company_id)?.name ?? '';
            const branchMembers = members.filter((m) => m.branchId === branch.id);
            return (
              <Card key={branch.id} className="p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-700">
                    <GitBranch className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-lg font-semibold text-primary-900">{branch.name}</h2>
                    <p className="text-xs text-neutral-600">{companyName}</p>
                    <p className="mt-1 text-xs text-neutral-600">
                      {t('branchesPage.membersCount', { count: branchMembers.length })}
                    </p>
                  </div>
                  <Badge tone="neutral">{t('branchesPage.branch')}</Badge>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <AddBranchDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

function AddBranchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const mutation = useCreateBranch();
  const [name, setName] = useState('');

  const handleClose = (next: boolean) => {
    if (!next && mutation.isPending) return;
    if (!next) {
      setName('');
      mutation.reset();
    }
    onOpenChange(next);
  };

  const submit = async () => {
    try {
      await mutation.mutateAsync({ name: name.trim() });
      setName('');
      onOpenChange(false);
    } catch {
      // surfaced via mutation.isError
    }
  };

  return (
    <Modal open={open} onOpenChange={handleClose} title={t('branchesPage.addTitle')}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && !mutation.isPending) void submit();
        }}
        className="flex flex-col gap-4"
      >
        <Field id="branch-name" label={t('branchesPage.fieldName')}>
          <input
            id="branch-name"
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={mutation.isPending}
            autoFocus
          />
        </Field>
        {mutation.isError && (
          <p role="alert" className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">
            {t('branchesPage.addFailed')}
          </p>
        )}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" type="button" onClick={() => handleClose(false)} disabled={mutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={!name.trim() || mutation.isPending}>
            {mutation.isPending ? t('common.save') : t('branchesPage.add')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
