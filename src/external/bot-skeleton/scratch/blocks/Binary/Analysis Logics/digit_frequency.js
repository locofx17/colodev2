import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../../utils';

Blockly.Blocks.digit_frequency = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('%1 frequency %2 from last %3 digits'),
            args0: [
                {
                    type: 'field_dropdown',
                    name: 'RANK',
                    options: [
                        [localize('Most'), 'MOST'],
                        [localize('Second Most'), 'SECOND_MOST'],
                        [localize('Second Least'), 'SECOND_LEAST'],
                        [localize('Least'), 'LEAST'],
                    ],
                },
                {
                    type: 'field_dropdown',
                    name: 'RETURN_TYPE',
                    options: [
                        [localize('Digit'), 'DIGIT'],
                        [localize('Percentage'), 'PERCENTAGE'],
                        [localize('Fraction (0-1)'), 'FRACTION'],
                    ],
                },
                {
                    type: 'field_number',
                    name: 'N',
                    value: 1000,
                    min: 1,
                    precision: 1,
                },
            ],
            output: 'Number',
            outputShape: Blockly.OUTPUT_SHAPE_ROUND,
            colour: Blockly.Colours.Base.colour,
            colourSecondary: Blockly.Colours.Base.colourSecondary,
            colourTertiary: Blockly.Colours.Base.colourTertiary,
            tooltip: localize('Finds most/least frequent digit in last N digits and returns the digit or percentage'),
            category: Blockly.Categories.Tick_Analysis,
        };
    },
    meta() {
        return {
            display_name: localize('Digit Frequency Analysis'),
            description: localize('Finds frequency patterns in last N digits and shows full ranking'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

Blockly.JavaScript.javascriptGenerator.forBlock.digit_frequency = block => {
    const rank = block.getFieldValue('RANK');
    const return_type = block.getFieldValue('RETURN_TYPE');
    const n = Number(block.getFieldValue('N')) || 1000;
    const code = `Bot.getDigitFrequency({ rank: '${rank}', n: ${n}, return_type: '${return_type}' })`;
    return [code, Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC];
};
