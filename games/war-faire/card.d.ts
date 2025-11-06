export function createDeck(activeCategories: any): Card[];
export function shuffleDeck(deck: any): any[];
export function getAllCategoryKeys(): string[];
export function getCategoryByName(name: any): {
    name: string;
    group: string;
} | {
    name: string;
    group: string;
} | {
    name: string;
    group: string;
} | {
    name: string;
    group: string;
} | {
    name: string;
    group: string;
} | {
    name: string;
    group: string;
} | {
    name: string;
    group: string;
} | {
    name: string;
    group: string;
} | {
    name: string;
    group: string;
} | {
    name: string;
    group: string;
} | {
    name: string;
    group: string;
} | {
    name: string;
    group: string;
} | undefined;
export function getCategoriesInGroup(groupName: any): ({
    name: string;
    group: string;
} | {
    name: string;
    group: string;
} | {
    name: string;
    group: string;
} | {
    name: string;
    group: string;
} | {
    name: string;
    group: string;
} | {
    name: string;
    group: string;
} | {
    name: string;
    group: string;
} | {
    name: string;
    group: string;
} | {
    name: string;
    group: string;
} | {
    name: string;
    group: string;
} | {
    name: string;
    group: string;
} | {
    name: string;
    group: string;
})[];
export namespace GROUPS {
    let PRODUCE: string;
    let BAKING: string;
    let LIVESTOCK: string;
}
export namespace CATEGORIES {
    namespace CARROTS {
        export let name: string;
        import group = GROUPS.PRODUCE;
        export { group };
    }
    namespace PUMPKINS {
        let name_1: string;
        export { name_1 as name };
        import group_1 = GROUPS.PRODUCE;
        export { group_1 as group };
    }
    namespace TOMATOES {
        let name_2: string;
        export { name_2 as name };
        import group_2 = GROUPS.PRODUCE;
        export { group_2 as group };
    }
    namespace CORN {
        let name_3: string;
        export { name_3 as name };
        import group_3 = GROUPS.PRODUCE;
        export { group_3 as group };
    }
    namespace PIES {
        let name_4: string;
        export { name_4 as name };
        import group_4 = GROUPS.BAKING;
        export { group_4 as group };
    }
    namespace CAKES {
        let name_5: string;
        export { name_5 as name };
        import group_5 = GROUPS.BAKING;
        export { group_5 as group };
    }
    namespace COOKIES {
        let name_6: string;
        export { name_6 as name };
        import group_6 = GROUPS.BAKING;
        export { group_6 as group };
    }
    namespace BREADS {
        let name_7: string;
        export { name_7 as name };
        import group_7 = GROUPS.BAKING;
        export { group_7 as group };
    }
    namespace PIGS {
        let name_8: string;
        export { name_8 as name };
        import group_8 = GROUPS.LIVESTOCK;
        export { group_8 as group };
    }
    namespace COWS {
        let name_9: string;
        export { name_9 as name };
        import group_9 = GROUPS.LIVESTOCK;
        export { group_9 as group };
    }
    namespace CHICKENS {
        let name_10: string;
        export { name_10 as name };
        import group_10 = GROUPS.LIVESTOCK;
        export { group_10 as group };
    }
    namespace GOATS {
        let name_11: string;
        export { name_11 as name };
        import group_11 = GROUPS.LIVESTOCK;
        export { group_11 as group };
    }
}
export const CARD_VALUES: number[];
export const GROUP_CARD_VALUES: number[];
export class Card {
    constructor(category: any, value: any, isGroupCard?: boolean);
    category: any;
    value: any;
    isGroupCard: boolean;
    selectedCategory: any;
    getDisplayName(): any;
    getEffectiveCategory(): any;
    clone(): Card;
}
//# sourceMappingURL=card.d.ts.map