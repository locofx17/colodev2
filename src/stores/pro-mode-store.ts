import { action, makeObservable, observable } from 'mobx';

export type TProModeView = 'real' | 'demo';

export class ProModeStore {
    is_pro_mode = false;
    pro_mode_view: TProModeView = 'real';
    is_activated = false;
    
    // Hardcoded IDs according to requirements
    public DEMO_ID = ''; // Will be set dynamically by the UI if needed

    public readonly MASKED_ID = 'CR8606511';
    public readonly MASKED_NAME = 'US Dollar';
    public readonly BASE_BALANCE = 10000;

    constructor() {
        makeObservable(this, {
            is_pro_mode: observable,
            pro_mode_view: observable,
            is_activated: observable,
            setProMode: action,
            setProModeView: action,
            activate: action,
        });

        // Load state from localStorage
        this.is_pro_mode = localStorage.getItem('is_pro_mode') === 'true';
        this.pro_mode_view = (localStorage.getItem('pro_mode_view') as TProModeView) || 'real';
        this.is_activated = localStorage.getItem('pro_mode_activated') === 'true';
    }

    setProMode = (is_pro_mode: boolean) => {
        this.is_pro_mode = is_pro_mode;
        localStorage.setItem('is_pro_mode', String(is_pro_mode));
    };

    setProModeView = (view: TProModeView) => {
        this.pro_mode_view = view;
        localStorage.setItem('pro_mode_view', view);
    };

    activate = (password: string) => {
        if (password === 'loco123') {
            this.is_activated = true;
            this.is_pro_mode = true;
            localStorage.setItem('pro_mode_activated', 'true');
            localStorage.setItem('is_pro_mode', 'true');
            return true;
        }
        return false;
    };

    deactivate = () => {
        this.is_pro_mode = false;
        this.is_activated = false;
        localStorage.removeItem('pro_mode_activated');
        localStorage.setItem('is_pro_mode', 'false');
    };
}
