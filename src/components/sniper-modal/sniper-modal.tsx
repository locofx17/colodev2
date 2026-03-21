import React, { Suspense } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import Dialog from '@/components/shared_ui/dialog';
import ChunkLoader from '@/components/loader/chunk-loader';
import { localize } from '@deriv-com/translations';

const SniperContent = React.lazy(() => import('@/pages/sniper/sniper-content'));

const SniperModal = observer(() => {
    const { dashboard } = useStore();
    const { is_sniper_modal_visible, setSniperModalVisibility } = dashboard;

    if (!is_sniper_modal_visible) return null;

    return (
        <Dialog
            className='sniper-modal'
            is_visible={is_sniper_modal_visible}
            onClose={() => setSniperModalVisibility(false)}
            onConfirm={() => setSniperModalVisibility(false)}
            has_close_icon
            is_mobile_full_width
            title=''
            portal_element_id='modal_root'
            login={() => {}}
        >
            <Suspense fallback={<ChunkLoader message={localize('Loading Sniper...')} />}>
                <SniperContent />
            </Suspense>
        </Dialog>
    );
});

export default SniperModal;
