import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../../utils';

Blockly.Blocks.sb_v1_phase = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('SB V1 Strategy Phase (1000 ticks)'),
            output: 'String',
            outputShape: Blockly.OUTPUT_SHAPE_ROUND,
            colour: Blockly.Colours.Base.colour,
            colourSecondary: Blockly.Colours.Base.colourSecondary,
            colourTertiary: Blockly.Colours.Base.colourTertiary,
            tooltip: localize('Returns the current mechanical phase of SB V1 strategy: IDLE, ODD_SENTIMENT, EVEN_SENTIMENT, PHASE_HIT_GREEN, PHASE_EXIT_MATCH, TRIGGER_ODD, TRIGGER_EVEN.'),
            category: Blockly.Categories.Tick_Analysis,
        };
    },
    meta() {
        return {
            display_name: localize('SB V1 Strategy Phase'),
            description: localize('Returns the current state machine phase of the SB V1 strategy for granular block-based logic.'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

Blockly.JavaScript.javascriptGenerator.forBlock.sb_v1_phase = block => {
    const code = `Bot.getSbV1Signal({ n: 1000 })`;
    return [code, Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC];
};
