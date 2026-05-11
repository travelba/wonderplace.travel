import { z } from 'zod';

const PropertiesArraySchema = z.array(z.unknown());

const PropertiesWrappedSchema = z.object({
  data: z.array(z.unknown()),
});

export function normalizeLittlePropertiesList(raw: unknown): readonly unknown[] | undefined {
  const direct = PropertiesArraySchema.safeParse(raw);
  if (direct.success) return direct.data;
  const wrapped = PropertiesWrappedSchema.safeParse(raw);
  if (wrapped.success) return wrapped.data.data;
  return undefined;
}
