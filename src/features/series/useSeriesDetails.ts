import { useQuery } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { SeriesRepository } from '@/data/repositories/SeriesRepository';
import { queryKeys } from '@/lib/queryKeys';
import type { Series, SeriesEntry } from '@/types/series';
import type { WorkWithAuthors } from '@/types/work';

export interface SeriesDetails {
  series: Series;
  entries: Array<{ entry: SeriesEntry; work: WorkWithAuthors }>;
}

/** Повний Series Screen (Milestone 2): серія + всі твори, впорядковані за позицією. */
export function useSeriesDetails(seriesId: string | undefined) {
  return useQuery<SeriesDetails | null>({
    queryKey: queryKeys.series.detail(seriesId ?? ''),
    queryFn: async () => {
      if (!seriesId) return null;
      const db = await getDatabase();
      return SeriesRepository.getByIdWithWorks(db, seriesId);
    },
    enabled: !!seriesId,
  });
}
