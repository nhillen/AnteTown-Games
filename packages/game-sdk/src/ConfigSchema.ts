/**
 * Game Configuration Schema System
 *
 * Allows games to declare their configuration requirements with:
 * - Base schema (common to all variants)
 * - Variant-specific schemas (extend/override base)
 * - Type safety and runtime validation
 */

import { z, ZodObject, ZodRawShape, ZodTypeAny } from 'zod';

/**
 * Metadata about a config field for UI generation
 */
export interface ConfigFieldMetadata {
  label: string;              // "Small Blind"
  description?: string;       // "The minimum bet for the first player"
  group?: string;             // "Betting Rules", "Table Settings"
  displayOrder?: number;      // For UI ordering
  unit?: 'pennies' | 'multiplier' | 'players' | 'percentage';  // Display hint
  min?: number;
  max?: number;
  step?: number;              // For numeric inputs
}

/**
 * Configuration schema with metadata
 */
export interface ConfigSchemaDefinition<
  TBase extends ZodTypeAny = any,
  TVariants extends Record<string, ZodTypeAny> = any
> {
  /** Common fields for all variants */
  baseSchema: TBase;

  /** Variant-specific overrides/extensions */
  variantSchemas?: {
    [K in keyof TVariants]: TVariants[K];
  };

  /** UI metadata for each field */
  fieldMetadata?: {
    [key: string]: ConfigFieldMetadata;
  };
}

/**
 * Infer the TypeScript type from a config schema
 */
export type InferConfigType<T extends ConfigSchemaDefinition> =
  z.infer<T['baseSchema']> &
  (T['variantSchemas'] extends Record<string, ZodTypeAny>
    ? Partial<z.infer<T['variantSchemas'][keyof T['variantSchemas']]>>
    : {});

/**
 * Game metadata exported by each game package
 */
export interface GameConfigMetadata<T extends ConfigSchemaDefinition = any> {
  gameType: string;            // 'houserules-poker', 'ck-flipz'
  displayName: string;         // 'House Rules Poker'
  configSchema: T;

  /** Available variants for this game */
  variants?: {
    id: string;
    displayName: string;
    description?: string;
  }[];
}

/**
 * Validate a config object against a schema (with optional variant)
 */
export function validateGameConfig<T extends ConfigSchemaDefinition>(
  schema: T,
  config: unknown,
  variant?: keyof T['variantSchemas']
): { success: true; data: InferConfigType<T> } | { success: false; error: z.ZodError } {
  try {
    // Validate base schema
    const baseData = schema.baseSchema.parse(config);

    // If variant specified, validate variant-specific fields
    if (variant && schema.variantSchemas && schema.variantSchemas[variant]) {
      const variantData = schema.variantSchemas[variant].partial().parse(config);
      return {
        success: true,
        data: { ...baseData, ...variantData } as InferConfigType<T>
      };
    }

    return {
      success: true,
      data: baseData as InferConfigType<T>
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error };
    }
    throw error;
  }
}

/**
 * Merge base config with variant-specific overrides
 */
export function mergeConfigWithVariant<T extends ConfigSchemaDefinition>(
  baseConfig: Partial<InferConfigType<T>>,
  variantConfig: Partial<InferConfigType<T>>,
  schema: T,
  variant: keyof T['variantSchemas']
): InferConfigType<T> {
  const merged = {
    ...baseConfig,
    ...variantConfig
  };

  const result = validateGameConfig(schema, merged, variant);

  if (!result.success) {
    throw new Error(`Invalid config merge: ${result.error.message}`);
  }

  return result.data;
}

/**
 * Helper to extract variant-specific fields from a full config
 */
export function extractVariantConfig<T extends ConfigSchemaDefinition>(
  fullConfig: InferConfigType<T>,
  schema: T,
  variant: keyof T['variantSchemas']
): Partial<InferConfigType<T>> {
  if (!schema.variantSchemas || !schema.variantSchemas[variant]) {
    return {};
  }

  const variantSchema = schema.variantSchemas[variant];
  const variantKeys = Object.keys(variantSchema.shape);

  const extracted: any = {};
  for (const key of variantKeys) {
    if (key in fullConfig) {
      extracted[key] = (fullConfig as any)[key];
    }
  }

  return extracted;
}
