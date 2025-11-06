export class Player {
    constructor(name: any, id: any);
    name: any;
    id: any;
    hand: any[];
    faceDownCards: any[];
    playedCards: any[];
    ribbons: any[];
    totalVP: number;
    addToHand(card: any): void;
    removeFromHand(card: any): boolean;
    playCardFaceUp(card: any): boolean;
    playCardFaceDown(card: any): boolean;
    flipFaceDownCards(): any[];
    getCategoryTotal(categoryName: any): any;
    addRibbon(category: any, type: any, vp: any): void;
    getGroupVP(groupName: any, activeCategories: any): any;
    clearForNextFair(): void;
    reset(): void;
    toString(): string;
}
//# sourceMappingURL=player.d.ts.map