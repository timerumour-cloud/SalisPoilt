import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchRoster,
  createRosterCompany,
  removeRosterMember,
  updateRosterMember,
  type RosterMemberFields,
} from '@/features/roster/rosterApi';

export function useRosterList(viewerId: string) {
  return useQuery({
    queryKey: ['roster', 'list', viewerId],
    queryFn: fetchRoster,
  });
}

export function useCreateRosterCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createRosterCompany(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roster'] }),
  });
}

export function useUpdateRosterMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: RosterMemberFields }) => updateRosterMember(id, fields),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roster'] }),
  });
}

export function useRemoveRosterMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => removeRosterMember(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roster'] }),
  });
}
