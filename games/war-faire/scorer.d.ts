export function scoreCategory(categoryName: any, players: any, prestige: any): {
    winners: {
        player: any;
        ribbonType: string | undefined;
        vp: any;
        total: any;
    }[];
    totalPoints: any;
};
export function scoreFair(players: any, activeCategories: any, categoryPrestige: any): {
    categories: {};
    groups: {};
};
export function updatePrestige(activeCategories: any, categoryPrestige: any, results: any): string[];
export function findCategoryToRetire(activeCategories: any, categoryPrestige: any, results: any): any;
export namespace RIBBON_TYPES {
    let GOLD: string;
    let SILVER: string;
    let BRONZE: string;
}
export namespace BASE_RIBBON_VALUES {
    let gold: number;
    let silver: number;
    let bronze: number;
}
//# sourceMappingURL=scorer.d.ts.map