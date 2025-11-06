import { Router, Request, Response } from 'express';
import prisma from '../config/database';

const router = Router();

// GET /api/dice-collections - Get all dice collections
router.get('/', async (_req: Request, res: Response) => {
  try {
    const collections = await prisma.diceCollection.findMany({
      orderBy: [
        { rarity: 'asc' },
        { price: 'asc' }
      ]
    });

    // Parse the JSON combo field
    const parsed = collections.map((c: any) => ({
      ...c,
      combo: JSON.parse(c.combo)
    }));

    res.json(parsed);
  } catch (error) {
    console.error('Error fetching dice collections:', error);
    res.status(500).json({ error: 'Failed to fetch dice collections' });
  }
});

// GET /api/dice-collections/:id - Get a specific dice collection
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({ error: 'Collection ID is required' });
    }

    const collection = await prisma.diceCollection.findUnique({
      where: { id }
    });

    if (!collection) {
      return res.status(404).json({ error: 'Dice collection not found' });
    }

    const parsed = {
      ...collection,
      combo: JSON.parse(collection.combo)
    };

    res.json(parsed);
  } catch (error) {
    console.error('Error fetching dice collection:', error);
    res.status(500).json({ error: 'Failed to fetch dice collection' });
  }
});

// POST /api/dice-collections - Create a new dice collection
router.post('/', async (req: Request, res: Response) => {
  try {
    const { id, name, rarity, theme, description, price, combo, complexity } = req.body;

    const collection = await prisma.diceCollection.create({
      data: {
        id,
        name,
        rarity,
        theme,
        description,
        price,
        combo: JSON.stringify(combo),
        complexity: complexity || 0
      }
    });

    const parsed = {
      ...collection,
      combo: JSON.parse(collection.combo)
    };

    res.status(201).json(parsed);
  } catch (error) {
    console.error('Error creating dice collection:', error);
    res.status(500).json({ error: 'Failed to create dice collection' });
  }
});

// PUT /api/dice-collections/:id - Update an existing dice collection
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({ error: 'Collection ID is required' });
    }

    const { name, rarity, theme, description, price, combo, complexity } = req.body;

    const collection = await prisma.diceCollection.update({
      where: { id },
      data: {
        name,
        rarity,
        theme,
        description,
        price,
        combo: JSON.stringify(combo),
        complexity: complexity || 0
      }
    });

    const parsed = {
      ...collection,
      combo: JSON.parse(collection.combo)
    };

    res.json(parsed);
  } catch (error) {
    console.error('Error updating dice collection:', error);
    res.status(500).json({ error: 'Failed to update dice collection' });
  }
});

// DELETE /api/dice-collections/:id - Delete a dice collection
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({ error: 'Collection ID is required' });
    }

    await prisma.diceCollection.delete({
      where: { id }
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting dice collection:', error);
    res.status(500).json({ error: 'Failed to delete dice collection' });
  }
});

export default router;
