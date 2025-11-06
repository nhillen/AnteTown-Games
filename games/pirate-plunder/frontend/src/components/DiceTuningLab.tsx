// @ts-nocheck - TODO: Fix type errors with glow property
import { getBackendUrl } from '../utils/backendUrl';
import React, { useState, useEffect } from 'react';
import { renderDice, initDiceSharedDefs, type DiceConfig, type SkinId, type MaterialType, type EffectConfig } from '../utils/diceRendererV2';
import { normalizeCombo, allowedOptionsFor, type DiceCombo, scoreCombo, rarityFromScore } from '../utils/diceRulesEngine';
import { DICE_COLLECTIONS, getCollectionById } from '../config/diceCollections';
import { useAuth } from './AuthProvider';

const SKINS: SkinId[] = ['bone', 'pearl', 'brass', 'ebony', 'ocean', 'obsidian'];
const MATERIALS: MaterialType[] = ['solid', 'frostedGlass', 'clearGlass', 'ghost'];
const GLOW_COLORS = [
  { name: 'Emerald', value: '#10b981' },
  { name: 'Gold', value: '#f59e0b' },
  { name: 'Ruby', value: '#ef4444' },
  { name: 'Sapphire', value: '#3b82f6' },
  { name: 'Amethyst', value: '#8b5cf6' },
  { name: 'Pearl', value: '#ec4899' }
];

const BACKEND_URL = getBackendUrl();

interface DiceTuningLabProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DiceTuningLab: React.FC<DiceTuningLabProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;
  const [rawConfig, setRawConfig] = useState<DiceCombo>({
    skin: 'bone',
    material: 'solid',
    value: 6,
    pipStyle: 'classic',
    glow: { color: '#10b981', strength: 'low' },
    effects: []
  });

  const [previewSize, setPreviewSize] = useState(80);
  const [showAllVariations, setShowAllVariations] = useState(false);
  const [loadedSkinId, setLoadedSkinId] = useState<string>('');
  const [saveAsName, setSaveAsName] = useState('');
  const [glowEnabled, setGlowEnabled] = useState(true);
  const [customSkins, setCustomSkins] = useState<any[]>([]);

  // Get user authentication context
  const { user } = useAuth();

  // Normalize config through rules engine (disable glow if not enabled)
  const configForNormalization = glowEnabled ? rawConfig : { ...rawConfig, glow: undefined };
  const config = normalizeCombo(configForNormalization);
  const allowedOptions = allowedOptionsFor(config.material);

  useEffect(() => {
    initDiceSharedDefs();
  }, []);

  // Fetch custom skins when user changes
  useEffect(() => {
    if (user?.id) {
      fetchCustomSkins();
    } else {
      setCustomSkins([]);
    }
  }, [user?.id]);

  const fetchCustomSkins = async () => {
    if (!user?.id) return;

    console.log('🎲 [LOAD SKINS] Fetching custom skins for user:', user.id);

    try {
      const response = await fetch(`${BACKEND_URL}/api/skins/custom/${user.id}`);
      console.log('📡 [LOAD SKINS] Response status:', response.status);

      if (!response.ok) {
        throw new Error('Failed to fetch custom skins');
      }

      const skins = await response.json();
      console.log('📦 [LOAD SKINS] Loaded custom skins:', skins);
      setCustomSkins(skins);
    } catch (error) {
      console.error('💥 [LOAD SKINS] Error fetching custom skins:', error);
      setCustomSkins([]);
    }
  };

  const updateConfig = (updates: Partial<DiceCombo>) => {
    setRawConfig(prev => ({ ...prev, ...updates }));
  };

  const updateGlow = (updates: Partial<NonNullable<DiceCombo['glow']>>) => {
    setRawConfig(prev => ({
      ...prev,
      glow: {
        color: '#10b981',
        strength: 'low',
        ...prev.glow,
        ...updates
      }
    }));
  };

  const addEffect = (type: EffectConfig['type']) => {
    // Check if we can add more effects based on rules
    if ((config.effects?.length || 0) >= allowedOptions.maxEffects) return;
    if (!allowedOptions.allowEffects.includes(type)) return;
    
    const newEffect: EffectConfig = { type };
    
    // Set defaults based on type
    switch (type) {
      case 'aura':
        newEffect.style = 'pulse';
        newEffect.color = config.glow?.color || '#10b981';
        break;
      case 'sparkles':
        newEffect.color = '#ffffff';
        newEffect.count = 6;
        break;
      case 'rim-marquee':
        newEffect.color = config.glow?.color || '#10b981';
        break;
    }
    
    setRawConfig(prev => ({
      ...prev,
      effects: [...(prev.effects || []), newEffect]
    }));
  };

  const updateEffect = (index: number, updates: Partial<EffectConfig>) => {
    setRawConfig(prev => ({
      ...prev,
      effects: prev.effects?.map((effect, i) => 
        i === index ? { ...effect, ...updates } : effect
      ) || []
    }));
  };

  const removeEffect = (index: number) => {
    setRawConfig(prev => ({
      ...prev,
      effects: prev.effects?.filter((_, i) => i !== index) || []
    }));
  };

  const loadSkin = (skinId: string) => {
    console.log('🎲 [LOAD SKIN] Loading skin:', skinId);

    // First try to find it in static collections
    const collection = getCollectionById(skinId);
    if (collection) {
      console.log('📦 [LOAD SKIN] Found static collection:', collection.name);
      const hasGlow = !!collection.combo.glow;
      setRawConfig({
        ...collection.combo,
        glow: hasGlow ? collection.combo.glow : undefined
      });
      setLoadedSkinId(skinId);
      setSaveAsName(collection.name);
      setGlowEnabled(hasGlow);
      return;
    }

    // Then try to find it in custom skins
    const customSkin = customSkins.find(skin => skin.id === skinId);
    if (customSkin) {
      console.log('📦 [LOAD SKIN] Found custom skin:', customSkin.name);
      const hasGlow = !!customSkin.combo.glow;
      setRawConfig({
        ...customSkin.combo,
        glow: hasGlow ? customSkin.combo.glow : undefined
      });
      setLoadedSkinId(skinId);
      setSaveAsName(customSkin.name);
      setGlowEnabled(hasGlow);
      return;
    }

    console.log('❌ [LOAD SKIN] Skin not found:', skinId);
  };

  const saveSkin = async () => {
    console.log('🎲 [SAVE SKIN] Starting save process...');

    if (!saveAsName.trim()) {
      console.log('❌ [SAVE SKIN] No name provided');
      alert('Please enter a name for the skin');
      return;
    }

    if (!user) {
      console.log('❌ [SAVE SKIN] User not logged in');
      alert('You must be logged in to save custom skins');
      return;
    }

    console.log('👤 [SAVE SKIN] User info:', {
      id: user.id,
      name: user.name
    });

    try {
      const comboToSave = glowEnabled ? rawConfig : { ...rawConfig, glow: undefined };

      // Only normalize if glow is enabled, otherwise save the raw combo to preserve no-glow state
      const finalCombo = glowEnabled ? normalizeCombo(comboToSave) : comboToSave;
      const score = scoreCombo(glowEnabled ? finalCombo : { ...comboToSave, glow: { color: '#F59E0B', strength: 'low' } });
      const rarity = rarityFromScore(score);

      const skinData = {
        userId: user.id,
        userName: user.name,
        skinId: saveAsName.toLowerCase().replace(/\s+/g, '-'),
        name: saveAsName,
        combo: finalCombo,
        complexity: score,
        rarity: rarity,
        isPublic: false
      };

      console.log('📦 [SAVE SKIN] Skin data to send:', {
        ...skinData,
        combo: '(dice combo data)'
      });

      console.log('🌐 [SAVE SKIN] Making request to:', `${BACKEND_URL}/api/skins/custom`);

      const response = await fetch(`${BACKEND_URL}/api/skins/custom`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(skinData)
      });

      console.log('📡 [SAVE SKIN] Response status:', response.status, response.statusText);

      if (!response.ok) {
        console.log('❌ [SAVE SKIN] Request failed, getting error details...');
        const error = await response.json();
        console.log('❌ [SAVE SKIN] Error response:', error);
        throw new Error(error.error || 'Failed to save skin');
      }

      console.log('✅ [SAVE SKIN] Request successful, parsing response...');
      const savedSkin = await response.json();

      console.log('💾 [SAVE SKIN] Full response data:', savedSkin);

      // Check if this is an update by comparing timestamps (if updatedAt exists, it was updated)
      const createdTime = new Date(savedSkin.createdAt).getTime();
      const updatedTime = new Date(savedSkin.updatedAt || savedSkin.createdAt).getTime();
      const wasUpdated = createdTime !== updatedTime;
      const action = wasUpdated ? 'updated' : 'created';

      console.log('⏰ [SAVE SKIN] Timestamp comparison:', {
        createdAt: savedSkin.createdAt,
        updatedAt: savedSkin.updatedAt,
        createdTime,
        updatedTime,
        wasUpdated,
        action
      });

      alert(`Skin "${saveAsName}" ${action} successfully!`);

      // Clear the name field after successful save
      setSaveAsName('');

      // Refresh custom skins list to show the new/updated skin
      await fetchCustomSkins();

      console.log(`🎉 [SAVE SKIN] Completed - skin ${action} successfully!`);
    } catch (error) {
      console.error('💥 [SAVE SKIN] Error occurred:', error);
      alert(`Failed to save skin: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const renderPreview = (configOverride?: Partial<DiceCombo>) => {
    const combo = { ...config, ...configOverride };
    // Convert DiceCombo to DiceConfig for renderer
    const diceConfig: DiceConfig = {
      size: previewSize,
      value: combo.value as 1|2|3|4|5|6,
      skin: combo.skin as SkinId,
      material: combo.material as MaterialType,
      glow: glowEnabled ? combo.glow : null,
      effects: combo.effects,
      glowStyle: 'high', // Always use high style in lab for consistency
      tint: combo.tint
    };
    return (
      <div 
        className="flex items-center justify-center bg-slate-800 rounded-lg border"
        style={{ width: previewSize + 40, height: previewSize + 40 }}
        dangerouslySetInnerHTML={{ __html: renderDice(diceConfig) }}
      />
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black bg-opacity-75" onClick={onClose} />
      <div className="relative bg-slate-900 rounded-lg shadow-2xl max-w-7xl w-full h-[90vh] overflow-y-auto">
        {/* Header with close button */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h1 className="text-3xl font-bold text-white">🎲 Dice Tuning Laboratory</h1>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none p-1"
          >
            ×
          </button>
        </div>
        
        <div className="p-6 text-white">

          {/* Load/Save Controls */}
          <div className="bg-slate-800 rounded-lg p-4 mb-6">
            <h2 className="text-xl font-semibold mb-4">Skin Management</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Load Section */}
              <div>
                <label className="block text-sm font-medium mb-2">Load Existing Skin</label>
                <div className="flex gap-2">
                  <select
                    value={loadedSkinId}
                    onChange={(e) => e.target.value && loadSkin(e.target.value)}
                    className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select a skin to load...</option>

                    {/* Static Collections */}
                    <optgroup label="Built-in Skins">
                      {DICE_COLLECTIONS.map(collection => (
                        <option key={collection.id} value={collection.id}>
                          {collection.name} ({collection.rarity})
                        </option>
                      ))}
                    </optgroup>

                    {/* Custom Skins */}
                    {customSkins.length > 0 && (
                      <optgroup label="My Custom Skins">
                        {customSkins.map(skin => (
                          <option key={`custom-${skin.id}`} value={skin.id}>
                            {skin.name} ({skin.rarity})
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
                {loadedSkinId && (
                  <div className="mt-2 text-sm text-slate-400">
                    Loaded: {getCollectionById(loadedSkinId)?.name || customSkins.find(skin => skin.id === loadedSkinId)?.name || 'Unknown'}
                  </div>
                )}
              </div>

              {/* Save Section */}
              <div>
                <label className="block text-sm font-medium mb-2">Save As New Skin</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={saveAsName}
                    onChange={(e) => setSaveAsName(e.target.value)}
                    placeholder="Enter skin name..."
                    className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={saveSkin}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-md font-medium transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>

            {/* Budget/Points Display */}
            <div className="mt-4 p-3 bg-slate-700 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="font-medium">Complexity Score:</span>
                <span className="text-lg font-bold text-yellow-400">{scoreCombo(config)}</span>
              </div>
              <div className="flex justify-between items-center mt-1">
                <span className="font-medium">Rarity:</span>
                <span className="text-lg font-bold text-purple-400">{rarityFromScore(scoreCombo(config))}</span>
              </div>
            </div>
          </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Controls Panel */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Basic Settings */}
          <div className="bg-slate-800 rounded-lg p-4">
            <h2 className="text-xl font-semibold mb-4">Basic Settings</h2>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-2">Die Value</label>
                <select 
                  value={config.value} 
                  onChange={(e) => updateConfig({ value: Number(e.target.value) as 1|2|3|4|5|6 })}
                  className="w-full p-2 bg-slate-700 rounded border border-slate-600"
                >
                  {[1,2,3,4,5,6].map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Preview Size</label>
                <input 
                  type="range" 
                  min="40" 
                  max="120" 
                  value={previewSize}
                  onChange={(e) => setPreviewSize(Number(e.target.value))}
                  className="w-full"
                />
                <span className="text-sm text-slate-400">{previewSize}px</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Skin</label>
                <select 
                  value={config.skin} 
                  onChange={(e) => updateConfig({ skin: e.target.value as SkinId })}
                  className="w-full p-2 bg-slate-700 rounded border border-slate-600"
                >
                  {SKINS.map(skin => (
                    <option key={skin} value={skin}>{skin}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Material</label>
                <select 
                  value={config.material} 
                  onChange={(e) => updateConfig({ material: e.target.value as MaterialType })}
                  className="w-full p-2 bg-slate-700 rounded border border-slate-600"
                >
                  {MATERIALS.map(material => (
                    <option key={material} value={material}>{material}</option>
                  ))}
                </select>
              </div>
            </div>

            {allowedOptions.allowTint && (
              <div className="mt-4">
                <label className="block text-sm font-medium mb-2">
                  Glass Tint (optional) 
                  <span className="text-xs text-slate-400 ml-1">- {config.material} allows tinting</span>
                </label>
                <input 
                  type="color" 
                  value={config.tint || '#ffffff'}
                  onChange={(e) => updateConfig({ tint: e.target.value })}
                  className="w-full h-10 bg-slate-700 rounded border border-slate-600"
                />
              </div>
            )}
            
            {!allowedOptions.allowTint && config.material === 'solid' && (
              <div className="mt-4 text-xs text-slate-500">
                💡 Solid material doesn't support tinting - try frosted or clear glass
              </div>
            )}
          </div>

          {/* Glow Settings */}
          <div className="bg-slate-800 rounded-lg p-4">
            <h2 className="text-xl font-semibold mb-4">Glow Settings</h2>

            {/* Glow Enable/Disable Toggle */}
            <div className="mb-4">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={glowEnabled}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    setGlowEnabled(enabled);
                    // Ensure glow object exists when enabling
                    if (enabled && !rawConfig.glow) {
                      setRawConfig(prev => ({
                        ...prev,
                        glow: { color: '#10b981', strength: 'low' }
                      }));
                    }
                  }}
                  className="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium">Enable Glow</span>
              </label>
            </div>

            {glowEnabled && (
              <>
                <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                <label className="block text-sm font-medium mb-2">Glow Strength</label>
                <select
                  value={config.glow?.strength || 'low'}
                  onChange={(e) => updateGlow({ strength: e.target.value as 'high' | 'low' })}
                  className="w-full p-2 bg-slate-700 rounded border border-slate-600"
                >
                  {allowedOptions.glowStrength.map(strength => (
                    <option key={strength} value={strength}>
                      {strength.charAt(0).toUpperCase() + strength.slice(1)}
                    </option>
                  ))}
                </select>
                <div className="text-xs text-slate-500 mt-1">
                  Available: {allowedOptions.glowStrength.join(', ')}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Glow Style (Always High in Lab)</label>
                <div className="w-full p-2 bg-slate-600 rounded border border-slate-600 text-slate-300">
                  High Style (Fixed)
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Glow Color</label>
              <div className="grid grid-cols-3 gap-2">
                {GLOW_COLORS.map(color => (
                  <button
                    key={color.value}
                    onClick={() => updateGlow({ color: color.value })}
                    className={`p-2 rounded text-sm border-2 ${
                      config.glow?.color === color.value 
                        ? 'border-white bg-slate-600' 
                        : 'border-slate-600 bg-slate-700'
                    }`}
                    style={{ backgroundColor: color.value + '20' }}
                  >
                    {color.name}
                  </button>
                ))}
              </div>
              <div className="mt-2">
                <input
                  type="color"
                  value={config.glow?.color || '#10b981'}
                  onChange={(e) => updateGlow({ color: e.target.value })}
                  className="w-full h-8 bg-slate-700 rounded border border-slate-600"
                />
              </div>
            </div>
              </>
            )}
          </div>

          {/* Effects */}
          <div className="bg-slate-800 rounded-lg p-4">
            <h2 className="text-xl font-semibold mb-4">Effects</h2>
            
            <div className="flex gap-2 mb-4">
              <button 
                onClick={() => addEffect('aura')}
                disabled={!allowedOptions.allowEffects.includes('aura') || (config.effects?.length || 0) >= allowedOptions.maxEffects}
                className="px-3 py-1 bg-blue-600 rounded text-sm hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed"
              >
                + Aura {!allowedOptions.allowEffects.includes('aura') ? '(blocked)' : ''}
              </button>
              <button 
                onClick={() => addEffect('sparkles')}
                disabled={!allowedOptions.allowEffects.includes('sparkles') || (config.effects?.length || 0) >= allowedOptions.maxEffects}
                className="px-3 py-1 bg-purple-600 rounded text-sm hover:bg-purple-500 disabled:bg-gray-600 disabled:cursor-not-allowed"
              >
                + Sparkles {!allowedOptions.allowEffects.includes('sparkles') ? '(blocked)' : ''}
              </button>
              <button 
                onClick={() => addEffect('rim-marquee')}
                disabled={!allowedOptions.allowEffects.includes('rim-marquee') || (config.effects?.length || 0) >= allowedOptions.maxEffects}
                className="px-3 py-1 bg-green-600 rounded text-sm hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed"
              >
                + Rim Marquee {!allowedOptions.allowEffects.includes('rim-marquee') ? '(blocked)' : ''}
              </button>
            </div>
            
            {(config.effects?.length || 0) >= allowedOptions.maxEffects && (
              <div className="text-xs text-yellow-400 mb-4">
                ⚠️ Maximum {allowedOptions.maxEffects} effects for {config.material} material
              </div>
            )}

            {config.effects?.map((effect, index) => (
              <div key={index} className="bg-slate-700 rounded p-3 mb-3">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-medium capitalize">{effect.type}</h3>
                  <button 
                    onClick={() => removeEffect(index)}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Remove
                  </button>
                </div>
                
                {effect.type === 'aura' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs mb-1">Style</label>
                      <select 
                        value={effect.style || 'pulse'}
                        onChange={(e) => updateEffect(index, { style: e.target.value as 'pulse' | 'electric' })}
                        className="w-full p-1 bg-slate-600 rounded text-sm"
                      >
                        <option value="pulse">Pulse</option>
                        <option value="electric">Electric</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs mb-1">Color</label>
                      <input 
                        type="color" 
                        value={effect.color || config.glow?.color}
                        onChange={(e) => updateEffect(index, { color: e.target.value })}
                        className="w-full h-8 bg-slate-600 rounded"
                      />
                    </div>
                  </div>
                )}
                
                {effect.type === 'sparkles' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs mb-1">Count</label>
                      <input 
                        type="range" 
                        min="3" 
                        max="12" 
                        value={effect.count || 6}
                        onChange={(e) => updateEffect(index, { count: Number(e.target.value) })}
                        className="w-full"
                      />
                      <span className="text-xs text-slate-400">{effect.count || 6}</span>
                    </div>
                    <div>
                      <label className="block text-xs mb-1">Color</label>
                      <input 
                        type="color" 
                        value={effect.color || '#ffffff'}
                        onChange={(e) => updateEffect(index, { color: e.target.value })}
                        className="w-full h-8 bg-slate-600 rounded"
                      />
                    </div>
                  </div>
                )}
                
                {effect.type === 'rim-marquee' && (
                  <div>
                    <label className="block text-xs mb-1">Color</label>
                    <input 
                      type="color" 
                      value={effect.color || config.glow?.color}
                      onChange={(e) => updateEffect(index, { color: e.target.value })}
                      className="w-full h-8 bg-slate-600 rounded"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Preview Panel */}
        <div className="space-y-6">
          {/* Main Preview */}
          <div className="bg-slate-800 rounded-lg p-4">
            <h2 className="text-xl font-semibold mb-4">Preview</h2>
            <div className="flex flex-col items-center">
              {renderPreview()}
              <div className="mt-4 text-center">
                <div className="text-lg font-semibold">{config.rarity}</div>
                <div className="text-sm text-slate-400">Complexity: {config.complexity} points</div>
                <div className="text-xs text-slate-500 mt-1">
                  Max Effects: {allowedOptions.maxEffects} | 
                  Tint: {allowedOptions.allowTint ? 'Yes' : 'No'}
                </div>
              </div>
            </div>
          </div>

          {/* All Values Preview */}
          <div className="bg-slate-800 rounded-lg p-4">
            <h2 className="text-xl font-semibold mb-4">All Values</h2>
            <div className="grid grid-cols-3 gap-2">
              {[1,2,3,4,5,6].map(value => (
                <div key={value} className="text-center">
                  <div className="text-xs text-slate-400 mb-1">{value}</div>
                  {renderPreview({ value: value as 1|2|3|4|5|6 })}
                </div>
              ))}
            </div>
          </div>

          {/* Export Config */}
          <div className="bg-slate-800 rounded-lg p-4">
            <h2 className="text-xl font-semibold mb-4">Export Config</h2>
            <textarea 
              value={JSON.stringify(config, null, 2)}
              readOnly
              className="w-full h-32 p-2 bg-slate-700 rounded text-xs font-mono"
            />
          </div>
        </div>
      </div>

      {/* Show All Variations */}
      <div className="mt-8">
        <button 
          onClick={() => setShowAllVariations(!showAllVariations)}
          className="px-4 py-2 bg-slate-700 rounded hover:bg-slate-600 mb-4"
        >
          {showAllVariations ? 'Hide' : 'Show'} All Material/Skin Combinations
        </button>
        
        {showAllVariations && (
          <div className="bg-slate-800 rounded-lg p-4">
            <h2 className="text-xl font-semibold mb-4">All Combinations</h2>
            <div className="grid grid-cols-4 gap-4">
              {MATERIALS.map(material => 
                SKINS.map(skin => (
                  <div key={`${material}-${skin}`} className="text-center">
                    <div className="text-xs text-slate-400 mb-2 capitalize">
                      {material} {skin}
                    </div>
                    {renderPreview({
                      material,
                      skin,
                      effects: [] // Simplified for overview
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
        </div>
      </div>
    </div>
  );
};