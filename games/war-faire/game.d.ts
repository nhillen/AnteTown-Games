export class Game {
    constructor(playerNames: any);
    players: any;
    fairNumber: number;
    roundNumber: number;
    deck: any[];
    activeCategories: any[];
    inactiveCategories: any[];
    categoryPrestige: {};
    gameLog: any[];
    log(message: any): void;
    setupFirstFair(): void;
    playRound(): void;
    playFair(): {
        categories: {};
        groups: {};
    };
    prepareNextFair(): void;
    displayStandings(): void;
    getWinner(): any;
}
//# sourceMappingURL=game.d.ts.map