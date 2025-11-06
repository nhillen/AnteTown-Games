import React, { useState } from 'react';
import { useAuth } from './AuthProvider';
import Button from './ui/Button';
import Panel from './ui/Panel';
import { Die } from './Dice';
import { cosmeticOptions } from '../config/cosmetics';
import { DICE_COLLECTIONS, getAllRarities } from '../config/diceCollections';
import { GachaCarousel } from './GachaCarousel';

interface StoreProps {
  isOpen: boolean;
  onClose: () => void;
}

interface StoreItem {
  id: string;
  name: string;
  category: string;
  price: number;
  isOwned: boolean;
  preview?: any;
}

export const Store: React.FC<StoreProps> = ({ isOpen, onClose }) => {
  const { user, purchaseCosmetic } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('skins');
  const [hidePurchased, setHidePurchased] = useState(false);
  const [rarityFilter, setRarityFilter] = useState<string>('all');
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Gacha state
  const [isSpinning, setIsSpinning] = useState(false);
  const [wonItem, setWonItem] = useState<string | null>(null);
  const [showCarousel, setShowCarousel] = useState(false);
  const [showWinModal, setShowWinModal] = useState(false);
  const [wonCollection, setWonCollection] = useState<any>(null);

  if (!isOpen || !user) return null;

  // Simple calculation without useMemo to avoid React hook issues
  const storeItems: StoreItem[] = [];
  if (user) {
    const userCosmetics = user.unlockedCosmetics || []; // Safe access with fallback

    // Add non-dice cosmetics (banner, emblem, title)
    ['banner', 'emblem', 'title'].forEach(category => {
      const options = cosmeticOptions[category as keyof typeof cosmeticOptions];
      Object.entries(options).forEach(([id, option]: [string, any]) => {
        if (id === 'none') return;

        storeItems.push({
          id,
          name: option.name || id,
          category,
          price: 2.00,
          isOwned: userCosmetics.includes(id),
          preview: option
        });
      });
    });

    // Add dice collections as "skins" category
    DICE_COLLECTIONS.forEach(collection => {
      storeItems.push({
        id: collection.id,
        name: collection.name,
        category: 'skins',
        price: collection.price,
        isOwned: userCosmetics.includes(collection.id),
        preview: collection
      });
    });
  }

  // Get available categories from store items for tabs, plus GGG at end
  const categories = [...new Set(storeItems.map(item => item.category)), 'ggg'];

  // Filter items by active tab, purchase status, and rarity
  const filteredItems = storeItems.filter(item => {
    if (item.category !== activeTab) return false;
    if (hidePurchased && item.isOwned) return false;
    if (activeTab === 'skins' && rarityFilter !== 'all' && item.preview?.rarity !== rarityFilter) return false;
    return true;
  });

  const handlePurchase = async (itemId: string) => {
    if (purchasing || !purchaseCosmetic) return;

    setPurchasing(itemId);
    setError(null);

    try {
      await purchaseCosmetic(itemId, 2.00);
      // Success - the auth context will be updated automatically
    } catch (err: any) {
      setError(err.message || 'Failed to purchase item');
    } finally {
      setPurchasing(null);
    }
  };

  const handleGachaSpin = async (spins: number = 1) => {
    if (isSpinning || !purchaseCosmetic) return;

    const cost = spins * 5.00;
    if (user.bankroll < cost) {
      setError('Insufficient funds for gacha spin');
      return;
    }

    setError(null);
    setIsSpinning(true);
    setShowCarousel(true);

    try {
      // Get unowned dice collections for gacha pool
      const userCosmetics = user.unlockedCosmetics || [];
      const availableCollections = DICE_COLLECTIONS.filter(
        collection => !userCosmetics.includes(collection.id)
      );

      if (availableCollections.length === 0) {
        setError('No more items available in gacha pool!');
        setIsSpinning(false);
        setShowCarousel(false);
        return;
      }

      // Weight by rarity (higher rarity = lower chance)
      const rarityWeights = { 'Swabbie': 40, 'Deckhand': 30, 'Corsair': 20, 'Captain': 10, 'Kraken': 5 };
      const weightedPool: string[] = [];

      availableCollections.forEach(collection => {
        const weight = rarityWeights[collection.rarity as keyof typeof rarityWeights] || 1;
        for (let i = 0; i < weight; i++) {
          weightedPool.push(collection.id);
        }
      });

      // Select random item
      const randomIndex = Math.floor(Math.random() * weightedPool.length);
      const selectedItemId = weightedPool[randomIndex];
      setWonItem(selectedItemId);

      // Purchase the item (this will deduct cost and grant the item)
      await purchaseCosmetic(selectedItemId, cost);

    } catch (err: any) {
      setError(err.message || 'Failed to spin gacha');
      setIsSpinning(false);
      setShowCarousel(false);
    }
  };

  const handleSpinComplete = () => {
    setIsSpinning(false);
    setShowCarousel(false);

    // Show win modal with the won item
    if (wonItem) {
      const collection = DICE_COLLECTIONS.find(c => c.id === wonItem);
      setWonCollection(collection);
      setShowWinModal(true);
    }

    setWonItem(null);
  };

  const getCategoryDisplayName = (category: string) => {
    switch (category) {
      case 'ggg': return 'GGG';
      case 'skins': return 'Dice Skins';
      case 'banner': return 'Banners';
      case 'emblem': return 'Emblems';
      case 'title': return 'Titles';
      default: return category.charAt(0).toUpperCase() + category.slice(1);
    }
  };

  const renderItemPreview = (item: StoreItem) => {
    const { preview, category } = item;
    
    switch (category) {
      case 'banner':
        return (
          <div className={`w-full h-12 rounded ${preview.gradient} ${preview.nameColor} flex items-center justify-center text-sm font-medium`}>
            {preview.name}
          </div>
        );
      case 'emblem':
        return (
          <div className="w-full h-12 flex items-center justify-center text-2xl">
            {preview.icon || '—'}
          </div>
        );
      case 'title':
        return (
          <div className="w-full h-12 flex items-center justify-center text-sm font-medium text-yellow-400">
            {preview || 'Title'}
          </div>
        );
      case 'skins':
        return (
          <div className="flex justify-center">
            <Die
              value={6}
              locked={false}
              preview={true}
              highSkin={item.id}
              lowSkin={item.id}
              size="sm"
            />
          </div>
        );
      default:
        return (
          <div className="w-full h-12 flex items-center justify-center text-sm text-gray-400">
            Preview
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
      <Panel className="max-w-4xl w-full m-4 max-h-[80vh] overflow-y-auto bg-slate-800 shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">
            {activeTab === 'ggg' ? '🎲 Gabe\'s Gacha Galleon' : '🛒 Pirate Store'}
          </h2>
          <Button onClick={onClose} variant="secondary" size="sm">×</Button>
        </div>

        {/* Player Bankroll */}
        <div className="mb-6 text-center">
          <div className="text-lg">
            <span className="text-gray-400">Your Bankroll: </span>
            <span className="text-green-400 font-bold">${user.bankroll.toFixed(2)}</span>
          </div>
        </div>

        {/* Filters - only show for non-GGG tabs */}
        {activeTab !== 'ggg' && (
          <div className="mb-4 flex items-center gap-6">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="hidePurchased"
                checked={hidePurchased}
                onChange={(e) => setHidePurchased(e.target.checked)}
                className="rounded bg-slate-700 border-slate-600"
              />
              <label htmlFor="hidePurchased" className="text-sm text-gray-300">
                Hide purchased items
              </label>
            </div>

            {activeTab === 'skins' && (
              <div className="flex items-center gap-2">
                <label htmlFor="rarityFilter" className="text-sm text-gray-300">
                  Rarity:
                </label>
                <select
                  id="rarityFilter"
                  value={rarityFilter}
                  onChange={(e) => setRarityFilter(e.target.value)}
                  className="px-2 py-1 bg-slate-700 border border-slate-600 rounded-md text-gray-200 text-sm"
                >
                  <option value="all">All</option>
                  {getAllRarities().map(rarity => (
                    <option key={rarity} value={rarity}>{rarity}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-2 mb-6 border-b border-slate-700">
          {categories.map(category => (
            <button
              key={category}
              onClick={() => setActiveTab(category)}
              className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
                activeTab === category
                  ? 'bg-slate-700 text-white border-b-2 border-blue-400'
                  : 'text-gray-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              {getCategoryDisplayName(category)}
            </button>
          ))}
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-900 border border-red-600 text-red-200 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* Content Area */}
        {activeTab === 'ggg' ? (
          /* GGG Content */
          <div className="space-y-6">
            {/* Subtitle */}
            <div className="text-center">
              <p className="text-gray-300 text-lg mb-6">
                Spin the wheel and claim unique plunder—no duplicates.
              </p>
            </div>

            {/* Carousel */}
            {showCarousel && (
              <div className="mb-6">
                <GachaCarousel
                  isSpinning={isSpinning}
                  wonItem={wonItem}
                  onSpinComplete={handleSpinComplete}
                />
              </div>
            )}

            {/* Spin Buttons */}
            <div className="flex justify-center gap-4">
              <Button
                variant="primary"
                className="px-8 py-4 text-xl font-bold bg-yellow-600 hover:bg-yellow-500"
                disabled={user.bankroll < 5.00 || isSpinning}
                onClick={() => handleGachaSpin(1)}
              >
                {isSpinning ? 'Spinning...' : 'Spin – $5.00'}
              </Button>
              <Button
                variant="secondary"
                className="px-6 py-4 text-lg font-bold"
                disabled={user.bankroll < 20.00 || isSpinning}
                onClick={() => handleGachaSpin(4)} // 4 spins for $20 (better deal)
              >
                Four Spins – $20.00
              </Button>
            </div>

            {/* Reward Preview Grid */}
            <div>
              <h3 className="text-xl font-semibold mb-4 text-center text-green-400">
                Available Rewards
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {storeItems
                  .filter(item => item.category === 'skins' && !item.isOwned)
                  .map(item => {
                    // Rarity-based border colors
                    const rarityColors = {
                      'Swabbie': 'border-gray-500',
                      'Deckhand': 'border-green-500',
                      'Corsair': 'border-blue-500',
                      'Captain': 'border-purple-500',
                      'Kraken': 'border-orange-500'
                    };
                    const borderColor = rarityColors[item.preview?.rarity as keyof typeof rarityColors] || 'border-slate-600';

                    return (
                      <div key={item.id} className={`bg-slate-700 rounded-lg p-3 border-2 ${borderColor}`}>
                        <div className="mb-2 bg-slate-800 rounded p-2 min-h-[50px] flex items-center justify-center">
                          {renderItemPreview(item)}
                        </div>
                        <div className="text-center">
                          <h4 className="text-sm font-medium text-white mb-1">{item.name}</h4>
                          <p className="text-xs text-slate-400">{item.preview?.rarity}</p>
                          <p className="text-sm font-bold text-green-400">${item.price.toFixed(2)} value</p>
                        </div>
                      </div>
                    );
                  })}
              </div>
              {storeItems.filter(item => item.category === 'skins' && !item.isOwned).length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  🎉 You've collected all available dice collections!
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Regular Store Items Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredItems.length === 0 ? (
              <div className="col-span-full text-center py-8 text-gray-400">
                {hidePurchased ? 'All items in this category are already owned!' : 'No items available in this category.'}
              </div>
            ) : (
              filteredItems.map(item => (
                <div key={`${item.category}-${item.id}`} className="bg-slate-700 rounded-lg p-4 border border-slate-600">
                  {/* Preview */}
                  <div className="mb-3 bg-slate-800 rounded p-3 h-[80px] flex items-center justify-center">
                    {renderItemPreview(item)}
                  </div>

                  {/* Item Info */}
                  <div className="space-y-3">
                    <div>
                      <h3 className="font-semibold text-white">{item.name}</h3>
                      {item.category === 'skins' && item.preview?.rarity && (
                        <p className="text-xs text-slate-400 mb-1">{item.preview.rarity}</p>
                      )}
                      {!item.isOwned && (
                        <p className="text-lg font-bold text-green-400">${item.price.toFixed(2)}</p>
                      )}
                    </div>

                    {/* Purchase Button */}
                    {item.isOwned ? (
                      <Button variant="secondary" size="sm" disabled className="w-full">
                        ✓ Owned
                      </Button>
                    ) : user.bankroll < item.price ? (
                      <Button variant="secondary" size="sm" disabled className="w-full">
                        Insufficient Funds
                      </Button>
                    ) : (
                      <Button
                        onClick={() => handlePurchase(item.id)}
                        variant="primary"
                        size="sm"
                        disabled={purchasing === item.id}
                        className="w-full"
                      >
                        {purchasing === item.id ? 'Purchasing...' : 'Buy Now'}
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </Panel>

      {/* Gacha Win Modal */}
      {showWinModal && wonCollection && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
          <Panel className="max-w-md w-full m-4 bg-slate-800 shadow-2xl">
            <div className="text-center space-y-6">
              <h2 className="text-2xl font-bold text-yellow-400">🎉 Congratulations!</h2>

              <div className="text-lg text-gray-300">
                You won:
              </div>

              {/* Won Item Display */}
              <div className={`bg-slate-700 rounded-lg p-4 border-2 ${
                wonCollection.rarity === 'Swabbie' ? 'border-gray-500' :
                wonCollection.rarity === 'Deckhand' ? 'border-green-500' :
                wonCollection.rarity === 'Corsair' ? 'border-blue-500' :
                wonCollection.rarity === 'Captain' ? 'border-purple-500' :
                'border-orange-500'
              }`}>
                <div className="mb-3 bg-slate-800 rounded p-3 flex items-center justify-center">
                  <Die
                    value={6}
                    locked={false}
                    preview={true}
                    highSkin={wonCollection.id}
                    lowSkin={wonCollection.id}
                    size="md"
                  />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">{wonCollection.name}</h3>
                <p className="text-sm text-slate-400 mb-2">{wonCollection.rarity}</p>
                <p className="text-sm text-slate-300">{wonCollection.description}</p>
                <p className="text-lg font-bold text-green-400 mt-2">${wonCollection.price.toFixed(2)} value</p>
              </div>

              <Button
                onClick={() => {
                  setShowWinModal(false);
                  setWonCollection(null);
                }}
                variant="primary"
                className="w-full bg-yellow-600 hover:bg-yellow-500"
              >
                Awesome! 🎲
              </Button>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
};