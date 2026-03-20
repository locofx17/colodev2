import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../../utils';

Blockly.Blocks.last_digits_even_odd = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Last %1 digits are %2'),
            args0: [
                {
                    type: 'field_number',
                    name: 'N',
                    value: 3,
                    min: 1,
                    precision: 1,
                },
                {
                    type: 'field_dropdown',
                    name: 'TYPE',
                    options: [
                        [localize('Even'), 'even'],
                        [localize('Odd'), 'odd'],
                    ],
                },
            ],
            output: 'Boolean',
            outputShape: Blockly.OUTPUT_SHAPE_ROUND,
            colour: Blockly.Colours.Base.colour,
            colourSecondary: Blockly.Colours.Base.colourSecondary,
            colourTertiary: Blockly.Colours.Base.colourTertiary,
            tooltip: localize('Returns true if all of the last N digits are even or odd'),
            category: Blockly.Categories.Tick_Analysis,
        };
    },
    meta() {
        return {
            display_name: localize('Last Digits Even/Odd'),
            description: localize('Checks if the last N digits are all even or all odd.'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

Blockly.JavaScript.javascriptGenerator.forBlock.last_digits_even_odd = block => {
    const n = Number(block.getFieldValue('N')) || 3;
    const type = block.getFieldValue('TYPE');

    const code = `Bot.getLastDigitsEvenOdd({ n: ${n}, type: '${type}' })`;
    return [code, Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC];
};
