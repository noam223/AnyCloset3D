// ==========================================
// auth.js — Supabase Auth + Projects Layer
// ==========================================

const SUPABASE_URL  = 'https://meqxnsjycvfgfhdepguo.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lcXhuc2p5Y3ZmZ2ZoZGVwZ3VvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MDA5NDAsImV4cCI6MjA5MjI3Njk0MH0.w63bl0-1-Rgt9Nx6sVW5ueEGMojiMaxoehlPXlPH2N0';

// ==========================================
// Plan Definitions — 6 plans across 3 user types
// ==========================================
const PLAN_LIMITS = {
    // ── מעצבות פנים ──────────────────────────────────────────────────────────
    designer_single: {
        label:                  'מעצבת — פרויקט בודד',
        userType:               'designer',
        price:                  0,           // חד-פעמי (מוגדר בחוץ)
        maxProjects:            1,
        maxCabinetsPerProject:  5,
        maxDevices:             1,
        projectLockDays:        3,           // נעילה אחרי 3 ימים
        extensionDays:          3,           // הארכה בתשלום — 3 ימים נוספים
        features: {
            showPricing:           false,    // מעצבת לא רואה תמחור
            canExportPDF:          true,
            canExport3D:           true,
            canExportCarpenter:    true,     // שליחה לייצור — כן
            canExportBlueprint:    true,     // שרטוט מרובה זוויות — כן
            canViewCustomerReport: true,     // סיכום ללקוח — כן (ללא מחירים)
            canExtendProject:      true,     // הארכה בתשלום
            canManageDevices:      false,
            isCompany:             false,
        }
    },
    designer_monthly: {
        label:                  'מעצבת — חודשי',
        userType:               'designer',
        price:                  0,
        maxProjects:            30,
        maxCabinetsPerProject:  12,
        maxDevices:             1,
        projectLockDays:        null,
        extensionDays:          null,
        features: {
            showPricing:           false,
            canExportPDF:          true,
            canExport3D:           true,
            canExportCarpenter:    true,
            canExportBlueprint:    true,
            canViewCustomerReport: true,
            canExtendProject:      false,
            canManageDevices:      false,
            isCompany:             false,
        }
    },
    designer_annual: {
        label:                  'מעצבת — שנתי',
        userType:               'designer',
        price:                  0,
        maxProjects:            30,
        maxCabinetsPerProject:  12,
        maxDevices:             1,
        projectLockDays:        null,
        extensionDays:          null,
        features: {
            showPricing:           false,
            canExportPDF:          true,
            canExport3D:           true,
            canExportCarpenter:    true,
            canExportBlueprint:    true,
            canViewCustomerReport: true,
            canExtendProject:      false,
            canManageDevices:      false,
            isCompany:             false,
        }
    },

    // ── נגרים ────────────────────────────────────────────────────────────────
    carpenter_basic: {
        label:                  'נגר — בסיסי',
        userType:               'carpenter',
        price:                  0,
        maxProjects:            30,
        maxCabinetsPerProject:  null,        // ללא הגבלה
        maxDevices:             1,
        projectLockDays:        null,
        extensionDays:          null,
        features: {
            showPricing:        true,
            canExportPDF:       true,
            canExport3D:        true,
            canExportCarpenter: false,       // ייצוא תוכנית לנגר — לא
            canViewCustomerReport: false,    // דוח פירוט ללקוח — לא
            canExtendProject:   false,
            canManageDevices:   false,
            isCompany:          false,
        }
    },
    carpenter_pro: {
        label:                  'נגר — מקצועי',
        userType:               'carpenter',
        price:                  0,
        maxProjects:            null,        // ללא הגבלה
        maxCabinetsPerProject:  null,
        maxDevices:             2,
        projectLockDays:        null,
        extensionDays:          null,
        features: {
            showPricing:        true,
            canExportPDF:       true,
            canExport3D:        true,
            canExportCarpenter: true,        // ייצוא תוכנית לנגר ✓
            canViewCustomerReport: true,     // דוח פירוט ללקוח ✓
            canExtendProject:   false,
            canManageDevices:   false,
            isCompany:          false,
        }
    },

    // ── חברות ריהוט ──────────────────────────────────────────────────────────
    company_standard: {
        label:                  'חברה — סטנדרט',
        userType:               'company',
        price:                  0,
        maxProjects:            null,
        maxCabinetsPerProject:  null,
        maxDevices:             10,
        projectLockDays:        null,
        extensionDays:          null,
        features: {
            showPricing:        true,
            canExportPDF:       true,
            canExport3D:        true,
            canExportCarpenter: true,
            canViewCustomerReport: true,
            canExtendProject:   false,
            canManageDevices:   true,        // ניהול מכשירים ✓
            isCompany:          true,
        }
    },
    company_enterprise: {
        label:                  'חברה — ארגוני',
        userType:               'company',
        price:                  0,
        maxProjects:            null,
        maxCabinetsPerProject:  null,
        maxDevices:             30,
        projectLockDays:        null,
        extensionDays:          null,
        features: {
            showPricing:        true,
            canExportPDF:       true,
            canExport3D:        true,
            canExportCarpenter: true,
            canViewCustomerReport: true,
            canExtendProject:   false,
            canManageDevices:   true,
            isCompany:          true,
        }
    },

    // ── Legacy / fallback ─────────────────────────────────────────────────────
    free: {
        label:                  'חינמי',
        userType:               'carpenter',
        price:                  0,
        maxProjects:            3,
        maxCabinetsPerProject:  null,
        maxDevices:             1,
        projectLockDays:        null,
        extensionDays:          null,
        features: {
            showPricing:        true,
            canExportPDF:       false,
            canExport3D:        false,
            canExportCarpenter: false,
            canViewCustomerReport: false,
            canExtendProject:   false,
            canManageDevices:   false,
            isCompany:          false,
        }
    }
};

// ── Supabase client ───────────────────────────────────────────────────────────
let _sb = null;
function _getClient() {
    if (_sb) return _sb;
    if (typeof supabase === 'undefined') { console.error('Supabase SDK not loaded'); return null; }
    _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    window._supabase = _sb; // expose for ai-renders.js and other modules
    return _sb;
}

// ==========================================
// Device Fingerprinting
// ==========================================

/**
 * Generate a stable device fingerprint from browser/OS/screen properties.
 * Not 100% unique but good enough for session-based device tracking.
 */
window._getDeviceFingerprint = async function() {
    const raw = [
        navigator.userAgent,
        navigator.language,
        screen.width + 'x' + screen.height,
        screen.colorDepth,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        navigator.hardwareConcurrency || '',
        navigator.platform || ''
    ].join('|');

    // SHA-256 hash via Web Crypto API
    const encoder = new TextEncoder();
    const data = encoder.encode(raw);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Human-readable device name: "Chrome / Windows 10"
 */
window._getDeviceName = function() {
    const ua = navigator.userAgent;
    let browser = 'דפדפן';
    let os = 'מערכת הפעלה';

    if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
    else if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
    else if (ua.includes('Edg')) browser = 'Edge';

    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Mac')) os = 'Mac';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

    return `${browser} / ${os}`;
};

// ==========================================
// Auth API
// ==========================================

window.Auth = {

    // ── Register ────────────────────────────────────────────────────────────
    register: async function(email, password, fullName, extraFields) {
        const sb = _getClient(); if (!sb) return { error: 'SDK not loaded' };
        extraFields = extraFields || {};

        const { data, error } = await sb.auth.signUp({
            email, password,
            options: {
                data: {
                    full_name:     fullName,
                    first_name:    extraFields.first_name   || '',
                    last_name:     extraFields.last_name    || '',
                    phone:         extraFields.phone         || '',
                    username:      extraFields.username      || '',
                    business_id:   extraFields.business_id   || '',
                    business_name: extraFields.business_name || '',
                    business_type: extraFields.business_type || ''
                }
            }
        });
        if (error) return { error: error.message };

        // If session exists (email confirm disabled), update profile immediately
        if (data.session && data.user) {
            await sb.from('profiles').update({
                full_name:     fullName,
                first_name:    extraFields.first_name   || null,
                last_name:     extraFields.last_name    || null,
                phone:         extraFields.phone         || null,
                username:      extraFields.username      || null,
                business_id:   extraFields.business_id   || null,
                business_name: extraFields.business_name || null,
                business_type: extraFields.business_type || null
            }).eq('id', data.user.id);
        }

        return { data, needsConfirmation: !data.session };
    },

    // ── Login ────────────────────────────────────────────────────────────────
    login: async function(email, password) {
        const sb = _getClient(); if (!sb) return { error: 'SDK not loaded' };
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) return { error: error.message };
        return { data };
    },

    // ── Logout ───────────────────────────────────────────────────────────────
    logout: async function() {
        const sb = _getClient(); if (!sb) return;
        await sb.auth.signOut();
        window.location.href = 'login.html';
    },

    // ── Get current session ──────────────────────────────────────────────────
    getSession: async function() {
        const sb = _getClient(); if (!sb) return null;
        const { data } = await sb.auth.getSession();
        return data.session;
    },

    // ── Get current user ─────────────────────────────────────────────────────
    getUser: async function() {
        const sb = _getClient(); if (!sb) return null;
        const { data } = await sb.auth.getUser();
        return data.user || null;
    },

    // ── Get profile ──────────────────────────────────────────────────────────
    getProfile: async function() {
        const sb = _getClient(); if (!sb) return null;
        const user = await this.getUser();
        if (!user) return null;
        const { data, error } = await sb
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
        if (error) return null;
        return data;
    },

    // ── Check if logged in ───────────────────────────────────────────────────
    isLoggedIn: async function() {
        const session = await this.getSession();
        return !!session;
    },

    // ── Require auth — redirect to login if not logged in ────────────────────
    requireAuth: async function() {
        const loggedIn = await this.isLoggedIn();
        if (!loggedIn) { window.location.href = 'login.html'; return false; }
        return true;
    },

    // ── Get plan info + feature flags ────────────────────────────────────────
    getPlan: async function() {
        const profile = await this.getProfile();
        const planKey = (profile && profile.plan) ? profile.plan : 'free';
        const planDef = PLAN_LIMITS[planKey] || PLAN_LIMITS['free'];

        // Allow profile to override maxDevices (for company plans with custom device count)
        const maxDevices = (profile && profile.max_devices != null)
            ? profile.max_devices
            : planDef.maxDevices;

        return {
            key: planKey,
            ...planDef,
            maxDevices,
            subscriptionStatus: (profile && profile.subscription_status) || 'active',
            subscriptionEndsAt: (profile && profile.subscription_ends_at) || null,
            trialEndsAt: (profile && profile.trial_ends_at) || null,
        };
    },

    // ── Get feature flags for current user ───────────────────────────────────
    getFeatures: async function() {
        const plan = await this.getPlan();
        return plan.features || PLAN_LIMITS['free'].features;
    },

    // ── Check if subscription is active ─────────────────────────────────────
    // Returns: { active: bool, reason: 'active'|'cancelled'|'trial'|'trial_expired'|'subscription_expired'|'inactive'|'free',
    //            trialEndsAt?, subscriptionEndsAt? }
    isSubscriptionActive: async function() {
        const profile = await this.getProfile();
        if (!profile) return { active: false, reason: 'no_profile' };

        const status = profile.subscription_status;

        // Trial period check
        if (status === 'trial') {
            if (!profile.trial_ends_at) return { active: true, reason: 'trial' };
            const trialEnd = new Date(profile.trial_ends_at);
            if (new Date() < trialEnd) {
                return { active: true, reason: 'trial', trialEndsAt: trialEnd };
            } else {
                return { active: false, reason: 'trial_expired', trialEndsAt: trialEnd };
            }
        }

        // Active subscription — also check subscription_ends_at if set
        if (status === 'active') {
            if (profile.subscription_ends_at) {
                const subEnd = new Date(profile.subscription_ends_at);
                if (new Date() > subEnd) {
                    // Subscription period ended — Scenario 3 should have renewed it,
                    // but if it failed (charge failed), treat as expired
                    return { active: false, reason: 'subscription_expired', subscriptionEndsAt: subEnd };
                }
            }
            return { active: true, reason: 'active' };
        }

        // Cancelled subscription — user cancelled but still within paid period
        if (status === 'cancelled') {
            if (profile.subscription_ends_at) {
                const subEnd = new Date(profile.subscription_ends_at);
                if (new Date() < subEnd) {
                    // Still within paid period — allow access, show "cancelled" notice
                    return { active: true, reason: 'cancelled', subscriptionEndsAt: subEnd };
                }
            }
            // Period has ended — block access
            return { active: false, reason: 'subscription_expired' };
        }

        // No plan / free — allow access
        if (!profile.plan || profile.plan === 'free') return { active: true, reason: 'free' };

        return { active: false, reason: 'inactive' };
    },

    // ── Cancel subscription (stops future charges, access until period end) ──
    cancelSubscription: async function() {
        const sb = _getClient(); if (!sb) return { error: 'SDK not loaded' };
        const user = await this.getUser();
        if (!user) return { error: 'Not logged in' };

        // Set status to 'cancelled' — Scenario 3 skips cancelled subscriptions
        // subscription_ends_at is intentionally left unchanged so user keeps access
        const { error } = await sb.from('profiles').update({
            subscription_status: 'cancelled'
        }).eq('id', user.id);

        if (error) return { error: error.message };

        // Bust profile cache so next call to isSubscriptionActive() sees new status
        this._profileCache = null;
        return { success: true };
    },

    // ── Start free trial (no payment required) ───────────────────────────────
    startFreeTrial: async function(plan) {
        const sb = _getClient(); if (!sb) return { error: 'SDK not loaded' };
        const user = await this.getUser();
        if (!user) return { error: 'Not logged in' };

        const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const { error } = await sb.from('profiles').update({
            plan,
            subscription_status: 'trial',
            trial_ends_at: trialEndsAt
        }).eq('id', user.id);

        if (error) return { error: error.message };
        return { success: true, trialEndsAt };
    },

    // ── Listen to auth state changes ─────────────────────────────────────────
    onAuthChange: function(callback) {
        const sb = _getClient(); if (!sb) return;
        sb.auth.onAuthStateChange((event, session) => { callback(event, session); });
    },

    // ==========================================
    // Device Management (for company plans)
    // ==========================================

    /**
     * Check if this device is allowed to access the app.
     * For non-company plans: always allowed.
     * For company plans: check device fingerprint against DB.
     * Returns: { allowed: bool, reason: string, deviceId: string|null }
     */
    checkDeviceAccess: async function() {
        const plan = await this.getPlan();
        if (!plan.features.isCompany) return { allowed: true, reason: 'ok' };

        const sb = _getClient(); if (!sb) return { allowed: false, reason: 'SDK not loaded' };
        const user = await this.getUser();
        if (!user) return { allowed: false, reason: 'not_logged_in' };

        const fingerprint = await window._getDeviceFingerprint();

        // Check if this device is already registered
        const { data: existingDevice } = await sb
            .from('devices')
            .select('*')
            .eq('user_id', user.id)
            .eq('fingerprint', fingerprint)
            .single();

        if (existingDevice) {
            if (!existingDevice.is_active) {
                return { allowed: false, reason: 'device_deactivated', deviceId: existingDevice.id };
            }
            // Update last_seen
            await sb.from('devices').update({ last_seen: new Date().toISOString() }).eq('id', existingDevice.id);
            return { allowed: true, reason: 'ok', deviceId: existingDevice.id };
        }

        // New device — check if under limit
        const { data: activeDevices } = await sb
            .from('devices')
            .select('id')
            .eq('user_id', user.id)
            .eq('is_active', true);

        const activeCount = (activeDevices || []).length;
        if (activeCount >= plan.maxDevices) {
            return { allowed: false, reason: 'device_limit_reached', activeCount, maxDevices: plan.maxDevices };
        }

        // Register new device
        const deviceName = window._getDeviceName();
        const { data: newDevice, error } = await sb
            .from('devices')
            .insert({
                user_id: user.id,
                fingerprint,
                device_name: deviceName,
                last_seen: new Date().toISOString(),
                is_active: true
            })
            .select()
            .single();

        if (error) return { allowed: false, reason: 'db_error' };
        return { allowed: true, reason: 'new_device_registered', deviceId: newDevice.id };
    },

    /**
     * List all devices for current user.
     */
    listDevices: async function() {
        const sb = _getClient(); if (!sb) return [];
        const user = await this.getUser();
        if (!user) return [];
        const { data } = await sb
            .from('devices')
            .select('*')
            .eq('user_id', user.id)
            .order('last_seen', { ascending: false });
        return data || [];
    },

    /**
     * Deactivate a device by ID (so another device can take its slot).
     */
    deactivateDevice: async function(deviceId) {
        const sb = _getClient(); if (!sb) return { error: 'SDK not loaded' };
        const { error } = await sb
            .from('devices')
            .update({ is_active: false })
            .eq('id', deviceId);
        if (error) return { error: error.message };
        return { success: true };
    },

    // ==========================================
    // Project Lock Logic (designer_single)
    // ==========================================

    /**
     * Check if a project is locked (read-only).
     * Returns: { locked: bool, lockedAt: Date|null, canExtend: bool }
     */
    checkProjectLock: function(project, plan) {
        if (!plan || !plan.projectLockDays) return { locked: false };

        const createdAt = new Date(project.created_at);
        const now = new Date();

        // Check if there's an active extension
        if (project.extension_expires_at) {
            const extExpires = new Date(project.extension_expires_at);
            if (extExpires > now) {
                return { locked: false, extendedUntil: extExpires };
            }
        }

        // Check original lock window
        const lockAfterMs = plan.projectLockDays * 24 * 60 * 60 * 1000;
        const lockDate = new Date(createdAt.getTime() + lockAfterMs);

        if (now > lockDate) {
            return {
                locked: true,
                lockedAt: lockDate,
                canExtend: plan.features.canExtendProject,
                extensionDays: plan.extensionDays
            };
        }

        // Not locked yet — show countdown
        const msLeft = lockDate - now;
        const hoursLeft = Math.ceil(msLeft / (1000 * 60 * 60));
        return { locked: false, locksAt: lockDate, hoursLeft };
    },

    /**
     * Extend a project's edit window (after payment).
     * Called after successful Grow payment webhook.
     */
    extendProject: async function(projectId, extensionDays) {
        const sb = _getClient(); if (!sb) return { error: 'SDK not loaded' };
        const now = new Date();
        const expiresAt = new Date(now.getTime() + extensionDays * 24 * 60 * 60 * 1000);

        const { data, error } = await sb
            .from('projects')
            .update({
                extension_expires_at: expiresAt.toISOString(),
                lock_extensions: sb.rpc('increment', { row_id: projectId }) // increments counter
            })
            .eq('id', projectId)
            .select()
            .single();

        if (error) return { error: error.message };
        return { data, expiresAt };
    },

    /**
     * Check if user can add another cabinet to a project.
     * Returns: { allowed: bool, reason: string }
     */
    checkCabinetLimit: async function(projectId, currentCount) {
        const plan = await this.getPlan();
        if (!plan.maxCabinetsPerProject) return { allowed: true };
        if (currentCount >= plan.maxCabinetsPerProject) {
            return {
                allowed: false,
                reason: `הגעת למגבלת ${plan.maxCabinetsPerProject} ארונות בפרויקט זה בתוכנית ${plan.label}.`
            };
        }
        return { allowed: true };
    }
};

// ==========================================
// Projects API
// ==========================================

window.Projects = {

    // ── List all projects for current user ───────────────────────────────────
    list: async function() {
        const sb = _getClient(); if (!sb) return [];
        // Try full column list first; fall back to minimal columns if schema migration hasn't run yet
        let { data, error } = await sb
            .from('projects')
            .select('id, name, thumbnail, created_at, updated_at, locked_at, extension_expires_at, lock_extensions, cabinet_count')
            .order('updated_at', { ascending: false });
        if (error) {
            console.warn('Projects.list full select failed (' + (error.message || error) + '), retrying with minimal columns');
            const res2 = await sb
                .from('projects')
                .select('id, name, thumbnail, created_at, updated_at')
                .order('updated_at', { ascending: false });
            data  = res2.data;
            error = res2.error;
        }
        if (error) { console.error('Projects.list:', error); return []; }
        return data || [];
    },

    // ── Load a single project ────────────────────────────────────────────────
    load: async function(projectId) {
        const sb = _getClient(); if (!sb) return null;
        const { data, error } = await sb
            .from('projects')
            .select('*')
            .eq('id', projectId)
            .single();
        if (error) { console.error('Projects.load:', error); return null; }
        return data;
    },

    // ── Save / update project ────────────────────────────────────────────────
    save: async function(projectId, name, projectData, thumbnail = null, cabinetCount = null) {
        const sb = _getClient(); if (!sb) return { error: 'SDK not loaded' };
        const user = await Auth.getUser();
        if (!user) return { error: 'Not logged in' };

        // Check plan limit before saving new project
        if (!projectId) {
            const plan = await Auth.getPlan();
            if (plan.maxProjects !== null) {
                const existing = await this.list();
                if (existing.length >= plan.maxProjects) {
                    return { error: `הגעת למגבלת ${plan.maxProjects} פרויקטים בתוכנית ${plan.label}.` };
                }
            }
        }

        const payload = {
            name,
            updated_at: new Date().toISOString(),
            ...(projectData != null && { project_data: projectData }),
            ...(thumbnail && { thumbnail }),
            ...(cabinetCount != null && { cabinet_count: cabinetCount })
        };

        if (projectId) {
            const { data, error } = await sb
                .from('projects')
                .update(payload)
                .eq('id', projectId)
                .select()
                .single();
            if (error) return { error: error.message };
            return { data };
        } else {
            const { data, error } = await sb
                .from('projects')
                .insert({ ...payload, user_id: user.id })
                .select()
                .single();
            if (error) return { error: error.message };
            return { data };
        }
    },

    // ── Update thumbnail only (no project_data change) ─────────────────────
    updateThumbnail: async function(projectId, thumbnail) {
        const sb = _getClient(); if (!sb) return { error: 'SDK not loaded' };
        if (!projectId || !thumbnail) return { error: 'Missing id or thumbnail' };
        const { data, error } = await sb
            .from('projects')
            .update({ thumbnail, updated_at: new Date().toISOString() })
            .eq('id', projectId)
            .select('id, thumbnail')
            .single();
        if (error) return { error: error.message };
        return { data };
    },

    // ── Delete project ───────────────────────────────────────────────────────
    delete: async function(projectId) {
        const sb = _getClient(); if (!sb) return { error: 'SDK not loaded' };
        const { error } = await sb.from('projects').delete().eq('id', projectId);
        if (error) return { error: error.message };
        return { success: true };
    },

    // ── Rename project ───────────────────────────────────────────────────────
    rename: async function(projectId, newName) {
        const sb = _getClient(); if (!sb) return { error: 'SDK not loaded' };
        const { data, error } = await sb
            .from('projects')
            .update({ name: newName, updated_at: new Date().toISOString() })
            .eq('id', projectId)
            .select()
            .single();
        if (error) return { error: error.message };
        return { data };
    },

    // ── Generate (or retrieve) a share token for live client viewing ─────────
    // Returns the full viewer URL. Safe to call multiple times — reuses existing token.
    // Token expires after 30 days; calling this again resets the expiry.
    generateShareToken: async function(projectId) {
        const sb = _getClient(); if (!sb) return { error: 'SDK not loaded' };

        // Check if token already exists and is not expired
        const { data: existing } = await sb
            .from('projects')
            .select('share_token, share_token_expires_at')
            .eq('id', projectId)
            .single();

        const now = new Date();
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
        const expiresAtISO = expiresAt.toISOString();

        let token = existing && existing.share_token;
        // If token exists but is expired, generate a new one
        if (token && existing.share_token_expires_at && new Date(existing.share_token_expires_at) < now) {
            token = null;
        }

        if (!token) {
            // Generate a cryptographically random 32-char hex token
            const bytes = new Uint8Array(16);
            crypto.getRandomValues(bytes);
            token = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
        }

        // Always update token + expiry (resets the 30-day clock on each share)
        const { error } = await sb
            .from('projects')
            .update({ share_token: token, share_token_expires_at: expiresAtISO })
            .eq('id', projectId);
        if (error) return { error: error.message };

        // Build viewer URL relative to the current page's directory
        // e.g. https://example.com/app/index.html → https://example.com/app/viewer.html
        const base = window.location.href.replace(/\/[^/]*$/, '/');
        const viewerUrl = base + 'viewer.html?token=' + token;
        return { token, url: viewerUrl, expiresAt: expiresAtISO };
    },

    // ── Revoke share token (disables the viewer link) ────────────────────────
    revokeShareToken: async function(projectId) {
        const sb = _getClient(); if (!sb) return { error: 'SDK not loaded' };
        const { error } = await sb
            .from('projects')
            .update({ share_token: null, share_token_expires_at: null })
            .eq('id', projectId);
        if (error) return { error: error.message };
        return { success: true };
    },

    // ── Load project by share token (no auth required — for viewer.html) ─────
    // Returns null if token not found or expired.
    loadByToken: async function(token) {
        const sb = _getClient(); if (!sb) return null;
        const { data, error } = await sb
            .from('projects')
            .select('id, name, project_data, share_token, share_token_expires_at, updated_at')
            .eq('share_token', token)
            .single();
        if (error) { console.error('Projects.loadByToken:', error); return null; }
        // Check expiry
        if (data && data.share_token_expires_at && new Date(data.share_token_expires_at) < new Date()) {
            console.warn('Projects.loadByToken: token expired');
            return { _expired: true };
        }
        return data;
    }
};

// ==========================================
// Grow Payments
// ==========================================

window.GrowPayments = {

    // ── Make Scenario 1 webhook — creates Grow payment link dynamically ──
    // Replace with your actual Scenario 1 webhook URL after importing the blueprint
    MAKE_PAYMENT_WEBHOOK: 'https://hook.eu1.make.com/2p1w789m4oeh3glw0pry61y0dd6vnlvd',

    // Start free trial — no payment required, just set trial period in DB
    startTrial: async function(plan) {
        const user = await Auth.getUser();
        if (!user) { window.location.href = 'login.html'; return; }

        try {
            const result = await Auth.startFreeTrial(plan);
            if (result.error) throw new Error(result.error);
            // Redirect to app after trial started
            window.location.href = 'projects.html?status=trial_started&plan=' + plan;
        } catch (err) {
            alert('שגיאה: ' + (err.message || 'נסה שוב'));
        }
    },

    // Open payment page — calls Make Scenario 1 which creates a Grow payment link
    openPayment: async function(plan) {
        const user = await Auth.getUser();
        if (!user) { window.location.href = 'login.html'; return; }

        try {
            const profile = await Auth.getProfile();
            const res = await fetch(this.MAKE_PAYMENT_WEBHOOK, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    plan,
                    email:    user.email,
                    fullName: (profile && profile.full_name) ? profile.full_name : user.email,
                    phone:    (profile && profile.phone) ? profile.phone : ''
                })
            });
            const data = await res.json();
            if (data.payment_url) {
                window.location.href = data.payment_url;
            } else {
                alert('שגיאה ביצירת קישור תשלום — נסה שוב');
            }
        } catch(err) {
            alert('שגיאת חיבור — נסה שוב: ' + (err.message || ''));
        }
    },

    openProjectExtension: async function(projectId) {
        // For project extensions, use openPayment with a special plan key
        // or implement a separate Grow payment link for extensions
        await this.openPayment('project_extension');
    }
};

// ==========================================
// Feature Gate Helper — use in UI code
// ==========================================

/**
 * Check if current user has a specific feature.
 * Usage: if (await canUse('canExportPDF')) { ... }
 */
window.canUse = async function(featureKey) {
    const features = await Auth.getFeatures();
    return !!features[featureKey];
};

/**
 * Cache features for the session (call once on page load).
 * After calling this, use window._features.canExportPDF etc. synchronously.
 */
window._features = null;
window.loadFeatures = async function() {
    window._features = await Auth.getFeatures();
    window._plan = await Auth.getPlan();
    return window._features;
};