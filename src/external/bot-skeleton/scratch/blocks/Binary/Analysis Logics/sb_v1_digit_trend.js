import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../../utils';

Blockly.Blocks.sb_v1_digit_trend = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Is Digit %1 Trend %2 (%3 vs %4 ticks)'),
            args0: [
                {
                    type: 'input_value',
                    name: 'DIGIT',
                    check: 'Number',
                },
                {
                    type: 'field_dropdown',
                    name: 'TREND',
                    options: [
                        [localize('Decreasing'), 'DECREASING'],
                        [localize('Increasing'), 'INCREASING'],
                    ],
                },
                {
                    type: 'field_number',
                    name: 'SHORT',
                    value: 20,
                    min: 1,
                },
                {
                    type: 'field_number',
                    name: 'LONG',
                    value: 1000,
                    min: 1,
                },
            ],
            output: 'Boolean',
            outputShape: Blockly.OUTPUT_SHAPE_ROUND,
            colour: Blockly.Colours.Base.colour,
            colourSecondary: Blockly.Colours.Base.colourSecondary,
            colourTertiary: Blockly.Colours.Base.colourTertiary,
            tooltip: localize('Checks if the digit frequency in the short-term window is less than the long-term frequency.'),
            category: Blockly.Categories.Tick_Analysis,
        };
    },
    meta() {
        return {
            display_name: localize('Digit Trend Analysis'),
            description: localize('Compares short-term vs long-term digit frequency.'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

Blockly.JavaScript.javascriptGenerator.forBlock.sb_v1_digit_trend = block => {
    const digit = Blockly.JavaScript.javascriptGenerator.valueToCode(block, 'DIGIT', Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC) || 0;
    const trend = block.getFieldValue('TREND');
    const short = Number(block.getFieldValue('SHORT')) || 20;
    const long = Number(block.getFieldValue('LONG')) || 1000;

    const op = trend === 'DECREASING' ? 'true' : 'false';
    const code = `await Bot.getDigitTrend({ digit: ${digit}, nShort: ${short}, nLong: ${long} })`;
    
    // Note: Since this is an async call in the trade engine, we use await if supported or ensure the engine handles it.
    // In DBot, most Bot.get... methods are wrapped in promises.
    return [code, Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC];
};
