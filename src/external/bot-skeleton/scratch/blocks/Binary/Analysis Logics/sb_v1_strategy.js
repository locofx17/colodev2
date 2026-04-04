import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../../utils';

Blockly.Blocks.sb_v1_strategy = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('SB V1 Entry Signal (1000 ticks)'),
            output: 'String',
            outputShape: Blockly.OUTPUT_SHAPE_ROUND,
            colour: Blockly.Colours.Base.colour,
            colourSecondary: Blockly.Colours.Base.colourSecondary,
            colourTertiary: Blockly.Colours.Base.colourTertiary,
            tooltip: localize('Returns EVEN, ODD, or NONE based on custom SB V1 entry mathematical logic.'),
            category: Blockly.Categories.Tick_Analysis,
        };
    },
    meta() {
        return {
            display_name: localize('SB V1 Strategy evaluator'),
            description: localize('Evaluates conditions for SB V1 Strategy and green/yellow bars.'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

Blockly.JavaScript.javascriptGenerator.forBlock.sb_v1_strategy = block => {
    const code = `Bot.getSbV1Signal({ n: 1000 })`;
    return [code, Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC];
};
