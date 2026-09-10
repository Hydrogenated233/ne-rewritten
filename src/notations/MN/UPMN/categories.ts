import { NotationCategoryDefinition } from '@/notation-definition.ts';

export const category_upmn: NotationCategoryDefinition = {
    id: 'category-upmn',
    name: 'Unupgrading Projection MN',
    simple_name: 'UPMN',
    parent_id: 'category-mn',
};

export const category_upmn_test: NotationCategoryDefinition = {
    id: 'category-upmn-test',
    name: { id: 'category-name.upmn-test' },
    parent_id: 'category-upmn',
};
