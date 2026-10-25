import { netsuiteRequest } from './client';

interface SuiteQlPage<Row> {
  items: Row[];
  hasMore: boolean;
  totalResults: number;
}

export async function suiteql<Row>(query: string, pageSize = 1000): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { body } = await netsuiteRequest<SuiteQlPage<Row>>(
      'POST',
      `/services/rest/query/v1/suiteql?limit=${pageSize}&offset=${offset}`,
      {
        body: { q: query },
        headers: { Prefer: 'transient' },
      },
    );
    rows.push(...(body?.items ?? []));
    if (!body?.hasMore) return rows;
  }
}
