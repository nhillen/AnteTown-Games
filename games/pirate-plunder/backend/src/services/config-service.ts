import * as fs from 'fs';
import * as path from 'path';
import { TableConfig, validateTableConfig, createDefaultConfig } from '../types/table-config';
import { logger } from '@pirate/core-engine';

export class ConfigService {
  private static instance: ConfigService;
  private currentConfig: TableConfig;
  private readonly configPath: string;

  private constructor() {
    this.configPath = path.join(__dirname, '../../config/table-config.json');
    this.currentConfig = this.loadConfig();
  }

  public static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  public getConfig(): TableConfig {
    return { ...this.currentConfig }; // Return a copy to prevent mutations
  }

  public reloadConfig(): TableConfig {
    logger.log('info', 'system', '🔄 Reloading table configuration from file');
    this.currentConfig = this.loadConfig();
    logger.log('info', 'system', '✅ Configuration reloaded successfully');
    return this.getConfig();
  }

  public updateConfig(partialConfig: Partial<TableConfig>): TableConfig {
    logger.log('info', 'system', '📝 Updating table configuration', { partialConfig });
    
    // Deep merge the partial config into the current config
    const newConfig = this.deepMerge(this.currentConfig, partialConfig);
    
    // Validate the new configuration
    if (!validateTableConfig(newConfig)) {
      logger.log('error', 'system', '❌ Configuration validation failed', { newConfig });
      throw new Error('Invalid configuration provided');
    }

    // Update metadata
    newConfig._metadata.lastModified = new Date().toISOString();
    
    // Save to file
    this.saveConfig(newConfig);
    
    // Update in memory
    this.currentConfig = newConfig;
    
    logger.log('info', 'system', '✅ Configuration updated successfully');
    return this.getConfig();
  }

  public applyPreset(presetName: string): TableConfig {
    logger.log('info', 'system', '🎯 Applying configuration preset', { presetName });
    
    const preset = this.currentConfig.presets[presetName];
    if (!preset) {
      throw new Error(`Preset '${presetName}' not found`);
    }

    return this.updateConfig(preset.config);
  }

  public getPresets(): Record<string, { name: string; description: string }> {
    const presets: Record<string, { name: string; description: string }> = {};
    
    for (const [key, preset] of Object.entries(this.currentConfig.presets)) {
      presets[key] = {
        name: preset.name,
        description: preset.description
      };
    }
    
    return presets;
  }

  private loadConfig(): TableConfig {
    try {
      logger.log('info', 'system', '📁 Loading table configuration from file', { path: this.configPath });
      
      if (!fs.existsSync(this.configPath)) {
        logger.log('warn', 'system', '⚠️ Configuration file not found, creating default', { path: this.configPath });
        const defaultConfig = createDefaultConfig();
        this.saveConfig(defaultConfig);
        return defaultConfig;
      }

      const fileContent = fs.readFileSync(this.configPath, 'utf-8');
      const config = JSON.parse(fileContent);

      // Merge loaded config with defaults to ensure all fields are present
      const defaultConfig = createDefaultConfig();
      const mergedConfig = this.deepMerge(defaultConfig, config);
      
      if (!validateTableConfig(mergedConfig)) {
        logger.log('error', 'system', '❌ Configuration file is invalid, using default');
        // Backup the invalid config
        const backupPath = `${this.configPath}.backup.${Date.now()}`;
        fs.writeFileSync(backupPath, fileContent);
        logger.log('info', 'system', '📦 Invalid config backed up to', { backupPath });
        this.saveConfig(defaultConfig);
        return defaultConfig;
      }

      // Save the merged config if it has new fields
      if (JSON.stringify(config) !== JSON.stringify(mergedConfig)) {
        logger.log('info', 'system', '🔄 Configuration merged with new defaults, saving updated version');
        this.saveConfig(mergedConfig);
      }

      logger.log('info', 'system', '✅ Configuration loaded successfully');
      return mergedConfig;
    } catch (error) {
      logger.log('error', 'system', '💥 Failed to load configuration, using default', { error: error instanceof Error ? error.message : String(error) });
      const defaultConfig = createDefaultConfig();
      this.saveConfig(defaultConfig);
      return defaultConfig;
    }
  }

  private saveConfig(config: TableConfig): void {
    try {
      // Ensure the config directory exists
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      const configJson = JSON.stringify(config, null, 2);
      fs.writeFileSync(this.configPath, configJson, 'utf-8');
      logger.log('info', 'system', '💾 Configuration saved to file', { path: this.configPath });
    } catch (error) {
      logger.log('error', 'system', '💥 Failed to save configuration', { error: error instanceof Error ? error.message : String(error), path: this.configPath });
      throw new Error(`Failed to save configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          result[key] = this.deepMerge(result[key] || {}, source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }
    
    return result;
  }
}

// Export singleton instance
export const configService = ConfigService.getInstance();