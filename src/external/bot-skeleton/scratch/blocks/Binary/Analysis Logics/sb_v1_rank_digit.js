import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../../utils';

Blockly.Blocks.sb_v1_rank_digit = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Digit at Rank %1 (last %2 digits)'),
            args0: [
                {
                    type: 'field_number',
                    name: 'RANK',
                    value: 1,
                    min: 1,
                    max: 10,
                },
                {
                    type: 'field_number',
                    name: 'N',
                    value: 1000,
                    min: 1,
                },
            ],
            output: 'Number',
            outputShape: Blockly.OUTPUT_SHAPE_ROUND,
            colour: Blockly.Colours.Base.colour,
            colourSecondary: Blockly.Colours.Base.colourSecondary,
            colourTertiary: Blockly.Colours.Base.colourTertiary,
            tooltip: localize('Returns the digit at specific frequency rank (e.g., 1 for most frequent, 10 for least).'),
            category: Blockly.Categories.Tick_Analysis,
        };
    },
    meta() {
        return {
            display_name: localize('Digit Rank Search'),
            description: localize('Returns the digit at the specified frequency rank.'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

Blockly.JavaScript.javascriptGenerator.forBlock.sb_v1_rank_digit = block => {
    const rank = Number(block.getFieldValue('RANK')) || 1;
    const n = Number(block.getFieldValue('N')) || 1000;
    const code = `await Bot.getDigitAtRank({ rank: ${rank}, n: ${n} })`;
    return [code, Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC];
};
