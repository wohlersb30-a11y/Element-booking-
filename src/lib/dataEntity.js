import { supabase } from '@/lib/supabaseClient';

// Base44 exposed `created_date`; Postgres uses `created_at`. Add the alias on
// read so existing UI code (sorting/display) keeps working unchanged.
const withAliases = (row) => {
  if (!row || typeof row !== 'object') return row;
  if (row.created_at && row.created_date === undefined) {
    return { ...row, created_date: row.created_at };
  }
  return row;
};

// Parse Base44-style ordering ("-field" = descending, "field" = ascending).
const applyOrder = (query, orderBy) => {
  if (!orderBy) return query;
  const desc = orderBy.startsWith('-');
  const column = desc ? orderBy.slice(1) : orderBy;
  // Map the legacy created_date alias back to the real column.
  const col = column === 'created_date' ? 'created_at' : column;
  return query.order(col, { ascending: !desc });
};

/**
 * Creates a data-access object with the same surface the app used on Base44
 * entities: list / filter / get / create / update / delete / bulkCreate.
 */
export function createEntity(table) {
  return {
    async list(orderBy) {
      let query = supabase.from(table).select('*');
      query = applyOrder(query, orderBy);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(withAliases);
    },

    async filter(criteria = {}, orderBy) {
      let query = supabase.from(table).select('*').match(criteria);
      query = applyOrder(query, orderBy);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(withAliases);
    },

    async get(id) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return withAliases(data);
    },

    async create(values) {
      const { data, error } = await supabase
        .from(table)
        .insert(values)
        .select()
        .single();
      if (error) throw error;
      return withAliases(data);
    },

    async bulkCreate(rows) {
      const { data, error } = await supabase
        .from(table)
        .insert(rows)
        .select();
      if (error) throw error;
      return (data || []).map(withAliases);
    },

    async update(id, patch) {
      const { data, error } = await supabase
        .from(table)
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return withAliases(data);
    },

    async delete(id) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      return { success: true };
    }
  };
}
