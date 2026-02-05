import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApi, useLazyApi } from '../hooks/useApi';
import {
  Crown,
  Clock,
  Users,
  MessageSquare,
  Brain,
  Bell,
  Check,
  X,
  LogOut,
  Shield,
  Mail,
  Key,
  Loader2,
  AlertCircle,
  Sparkles,
  Download,
  ChevronRight,
} from 'lucide-react';

// ===========================================================================
// Types
// ===========================================================================

interface SubscriptionData {
  tier: 'free' | 'trial' | 'premium';
  isTrialActive: boolean;
  trialEndsAt: string | null;
  isPremium: boolean;
  hasStripe: boolean;
}

interface UsageData {
  date: string;
  messages_sent: number;
  nudges_generated: number;
  contacts_added: number;
  braindumps_processed: number;
}

interface ContactHealthData {
  total: number;
  byHealth: {
    green: number;
    yellow: number;
    red: number;
  };
}

// Free tier limits (mirrored from models.ts)
const FREE_TIER_LIMITS = {
  max_contacts: 15,
  max_messages_per_day: 10,
  max_braindumps_per_day: 1,
  max_nudges_per_day: 3,
} as const;

// ===========================================================================
// Component
// ===========================================================================

export function SettingsPage() {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();

  // API data
  const { data: subscription } = useApi<SubscriptionData>('/api/subscription');
  const { data: contactHealth } = useApi<ContactHealthData>('/api/contacts/health');
  
  // Form states
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // PIN change states
  const [showPinChange, setShowPinChange] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isSavingPin, setIsSavingPin] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSuccess, setPinSuccess] = useState(false);

  const { execute: updateUser } = useLazyApi();
  const { execute: changePin } = useLazyApi();

  // Calculate trial days remaining
  const trialDaysLeft = subscription?.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(subscription.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  // Determine subscription display
  const getSubscriptionInfo = () => {
    if (!subscription) return { label: 'Loading...', description: '', color: 'gray' };
    
    if (subscription.isPremium) {
      return {
        label: 'Premium',
        description: 'Unlimited contacts and features',
        color: 'violet',
        icon: Crown,
      };
    }
    
    if (subscription.isTrialActive) {
      return {
        label: 'Trial',
        description: `${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} remaining`,
        color: 'bethany',
        icon: Clock,
      };
    }
    
    return {
      label: 'Free',
      description: `${FREE_TIER_LIMITS.max_contacts} contacts, limited features`,
      color: 'gray',
      icon: Users,
    };
  };

  const subInfo = getSubscriptionInfo();

  // Save profile changes
  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
    setProfileError(null);
    setProfileSuccess(false);

    try {
      await updateUser('/api/user', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || null,
        }),
      });

      await refreshUser();
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Change PIN
  const handleChangePin = async () => {
    setPinError(null);
    setPinSuccess(false);

    // Validate
    if (!/^\d{4}$/.test(newPin)) {
      setPinError('PIN must be 4 digits');
      return;
    }
    if (newPin !== confirmPin) {
      setPinError('PINs do not match');
      return;
    }

    setIsSavingPin(true);

    try {
      await changePin('/api/user/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_pin: currentPin,
          new_pin: newPin,
        }),
      });

      setPinSuccess(true);
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      setShowPinChange(false);
      setTimeout(() => setPinSuccess(false), 3000);
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'Failed to change PIN');
    } finally {
      setIsSavingPin(false);
    }
  };

  // Logout handler
  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Export handler
  const handleExport = () => {
    window.location.href = '/api/export';
  };

  // Upgrade handler
  const handleUpgrade = async () => {
    // TODO: Implement Stripe checkout
    alert('Stripe checkout coming soon!');
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Settings</h1>
        <p className="text-gray-500">
          Manage your account, subscription, and preferences.
        </p>
      </div>

      {/* Subscription Card */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-medium text-gray-900">Subscription</h2>
          {subscription && !subscription.isPremium && (
            <button
              onClick={handleUpgrade}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-bethany-500 text-white text-sm font-medium rounded-lg hover:bg-bethany-600 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              Upgrade
            </button>
          )}
        </div>
        
        <div className="p-5">
          {/* Status badge */}
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              subInfo.color === 'violet' ? 'bg-violet-100' :
              subInfo.color === 'bethany' ? 'bg-bethany-100' :
              'bg-gray-100'
            }`}>
              {subInfo.icon && (
                <subInfo.icon className={`w-6 h-6 ${
                  subInfo.color === 'violet' ? 'text-violet-600' :
                  subInfo.color === 'bethany' ? 'text-bethany-600' :
                  'text-gray-600'
                }`} />
              )}
            </div>
            <div>
              <p className="font-semibold text-gray-900">{subInfo.label}</p>
              <p className="text-sm text-gray-500">{subInfo.description}</p>
            </div>
          </div>

          {/* Usage stats for free/trial users */}
          {subscription && !subscription.isPremium && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-sm font-medium text-gray-700 mb-3">Usage limits</p>
              <div className="grid grid-cols-2 gap-3">
                <UsageStat
                  icon={Users}
                  label="Contacts"
                  current={contactHealth?.total ?? 0}
                  max={FREE_TIER_LIMITS.max_contacts}
                />
                <UsageStat
                  icon={MessageSquare}
                  label="Messages/day"
                  current={0} // Would come from usage tracking
                  max={FREE_TIER_LIMITS.max_messages_per_day}
                />
                <UsageStat
                  icon={Brain}
                  label="Braindumps/day"
                  current={0}
                  max={FREE_TIER_LIMITS.max_braindumps_per_day}
                />
                <UsageStat
                  icon={Bell}
                  label="Nudges/day"
                  current={0}
                  max={FREE_TIER_LIMITS.max_nudges_per_day}
                />
              </div>
            </div>
          )}

          {/* Premium benefits */}
          {subscription?.isPremium && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex items-center gap-2 text-sm text-green-600">
                <Check className="w-4 h-4" />
                <span>Unlimited contacts</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-green-600 mt-1">
                <Check className="w-4 h-4" />
                <span>Unlimited messages</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-green-600 mt-1">
                <Check className="w-4 h-4" />
                <span>Priority support</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Profile Card */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-medium text-gray-900">Profile</h2>
        </div>
        
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-bethany-500 focus:border-transparent outline-none"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-bethany-500 focus:border-transparent outline-none"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone
            </label>
            <input
              type="tel"
              value={user?.phone || ''}
              disabled
              className="w-full max-w-md px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Phone number cannot be changed
            </p>
          </div>

          {/* Save button and feedback */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveProfile}
              disabled={isSavingProfile}
              className="px-4 py-2 bg-bethany-500 text-white font-medium rounded-lg hover:bg-bethany-600 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isSavingProfile ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Save changes'
              )}
            </button>
            
            {profileSuccess && (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <Check className="w-4 h-4" />
                Saved!
              </span>
            )}
            
            {profileError && (
              <span className="text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {profileError}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Security Card */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-medium text-gray-900">Security</h2>
        </div>
        
        <div className="p-5 space-y-4">
          {/* Change PIN section */}
          {!showPinChange ? (
            <button
              onClick={() => setShowPinChange(true)}
              className="w-full max-w-md flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Key className="w-5 h-5 text-gray-400" />
                <div className="text-left">
                  <p className="font-medium text-gray-900">Change PIN</p>
                  <p className="text-sm text-gray-500">Update your 4-digit security PIN</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </button>
          ) : (
            <div className="max-w-md p-4 border border-gray-200 rounded-lg bg-gray-50">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-gray-900">Change PIN</h3>
                <button
                  onClick={() => {
                    setShowPinChange(false);
                    setCurrentPin('');
                    setNewPin('');
                    setConfirmPin('');
                    setPinError(null);
                  }}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Current PIN</label>
                  <input
                    type="password"
                    value={currentPin}
                    onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    maxLength={4}
                    placeholder="••••"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-bethany-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">New PIN</label>
                  <input
                    type="password"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    maxLength={4}
                    placeholder="••••"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-bethany-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Confirm new PIN</label>
                  <input
                    type="password"
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    maxLength={4}
                    placeholder="••••"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-bethany-500 focus:border-transparent outline-none"
                  />
                </div>

                {pinError && (
                  <p className="text-sm text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    {pinError}
                  </p>
                )}

                <button
                  onClick={handleChangePin}
                  disabled={isSavingPin || !currentPin || !newPin || !confirmPin}
                  className="w-full px-4 py-2 bg-bethany-500 text-white font-medium rounded-lg hover:bg-bethany-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSavingPin ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Update PIN'
                  )}
                </button>
              </div>
            </div>
          )}

          {pinSuccess && (
            <p className="text-sm text-green-600 flex items-center gap-1">
              <Check className="w-4 h-4" />
              PIN updated successfully!
            </p>
          )}
        </div>
      </div>

      {/* Data Card */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-medium text-gray-900">Data</h2>
        </div>
        
        <div className="p-5">
          <button
            onClick={handleExport}
            className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Download className="w-5 h-5 text-gray-400" />
            <div className="text-left">
              <p className="font-medium text-gray-900">Export contacts</p>
              <p className="text-sm text-gray-500">Download all your contacts as CSV</p>
            </div>
          </button>
        </div>
      </div>

      {/* Logout Card */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-5">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 p-3 border border-red-200 rounded-lg hover:bg-red-50 transition-colors text-red-600 w-full max-w-md"
          >
            <LogOut className="w-5 h-5" />
            <div className="text-left">
              <p className="font-medium">Log out</p>
              <p className="text-sm text-red-500">Sign out of your account on this device</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Usage Stat Component
// ===========================================================================

function UsageStat({
  icon: Icon,
  label,
  current,
  max,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  current: number;
  max: number;
}) {
  const percentage = Math.min((current / max) * 100, 100);
  const isNearLimit = percentage >= 80;
  const isAtLimit = percentage >= 100;

  return (
    <div className="p-3 bg-gray-50 rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-gray-400" />
        <span className="text-sm text-gray-600">{label}</span>
      </div>
      <div className="flex items-center justify-between mb-1">
        <span className={`text-lg font-semibold ${
          isAtLimit ? 'text-red-600' : isNearLimit ? 'text-yellow-600' : 'text-gray-900'
        }`}>
          {current}
        </span>
        <span className="text-sm text-gray-400">/ {max}</span>
      </div>
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isAtLimit ? 'bg-red-500' : isNearLimit ? 'bg-yellow-500' : 'bg-bethany-500'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
