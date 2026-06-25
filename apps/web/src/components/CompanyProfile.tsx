import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { IdCard, Mail, Phone, Pencil } from 'lucide-react';
import UserManagement from './UserManagement';
import ProfileHeader from './shared/ProfileHeader';
import { Button } from '@/components/ui/button';
import { Company, SYSTEM_LANGUAGES } from '../types';

interface CompanyProfileProps {
    company: Company;
    onEdit: (company: Company) => void;
    onRefresh: () => void;
    onBack?: () => void;
}

const Info: React.FC<{ label: string; value?: string | null }> = ({ label, value }) => (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
        <p className="mt-0.5 text-sm text-slate-800 break-words">{value || '—'}</p>
    </div>
);

interface CompanyLocalizationSettings {
    dateFormat: string;
    timeFormat: string;
    timezone: string;
    baseCurrency: string;
    moneyFormat: string;
    currencyPosition: string;
    defaultLanguage: string;
}

const CompanyProfile: React.FC<CompanyProfileProps> = ({ company, onEdit, onRefresh, onBack }) => {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState('Overview');
    const [isUploading, setIsUploading] = useState(false);
    const [isSavingSettings, setIsSavingSettings] = useState(false);
    const [baseCurrencies, setBaseCurrencies] = useState<{ id: string; code?: string; name: string }[]>([]);
    const [companySettings, setCompanySettings] = useState<CompanyLocalizationSettings>({
        dateFormat: company.dateFormat || 'YYYY/MM/DD',
        timeFormat: company.timeFormat || '14:19',
        timezone: company.timezone || 'UTC',
        baseCurrency: company.baseCurrency || 'USD',
        moneyFormat: company.moneyFormat || '1,234.56',
        currencyPosition: company.currencyPosition || '$ 100',
        defaultLanguage: company.defaultLanguage || 'English'
    });
    const [timezoneSearch, setTimezoneSearch] = useState('');
    const [isTimezoneOpen, setIsTimezoneOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const timezoneDropdownRef = useRef<HTMLDivElement>(null);

    const handleLogoClick = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        const formData = new FormData();
        formData.append('logo', file);

        try {
            const response = await fetch(`/api/companies/${company.id}/logo`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to upload logo');
            }

            alert(t('settings.logoUploadedSuccess') || 'Logo subido con éxito');
            onRefresh();
        } catch (error: any) {
            console.error('Error uploading logo:', error);
            alert(`${t('settings.logoUploadError') || 'Error subiendo logo'}: ${error.message}`);
        } finally {
            setIsUploading(false);
        }
    };

    const locationParts = [company.address, company.zipcode, company.city, company.state, company.country].filter(Boolean);
    const mapQuery = encodeURIComponent(locationParts.join(', ') || company.name);
    const mapEmbedUrl = `https://maps.google.com/maps?q=${mapQuery}&z=15&output=embed`;


    useEffect(() => {
        setCompanySettings({
            dateFormat: company.dateFormat || 'YYYY/MM/DD',
            timeFormat: company.timeFormat || '14:19',
            timezone: company.timezone || 'UTC',
            baseCurrency: company.baseCurrency || 'USD',
            moneyFormat: company.moneyFormat || '1,234.56',
            currencyPosition: company.currencyPosition || '$ 100',
            defaultLanguage: company.defaultLanguage || 'English'
        });
    }, [company]);

    useEffect(() => {
        const catQs = `?companyId=${encodeURIComponent(company.id)}&`;
        fetch(`/api/categories${catQs}t=${Date.now()}`)
            .then(res => res.ok ? res.json() : [])
            .then((cats: any[]) => {
                const currencyCategory = cats.find(c => c.code === 'BASE_CURRENCY');
                if (!currencyCategory) {
                    setBaseCurrencies([]);
                    return;
                }

                fetch(`/api/categories/${currencyCategory.id}?companyId=${encodeURIComponent(company.id)}&t=${Date.now()}`)
                    .then(r => r.ok ? r.json() : { items: [] })
                    .then(data => setBaseCurrencies((data.items || []).filter((item: any) => item.status === 'Active')))
                    .catch(() => setBaseCurrencies([]));
            })
            .catch(() => setBaseCurrencies([]));
    }, [company.id]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (timezoneDropdownRef.current && !timezoneDropdownRef.current.contains(event.target as Node)) {
                setIsTimezoneOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const timezoneOptions = Array.from(
        new Set([
            companySettings.timezone,
            ...(typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl
                ? (Intl as unknown as { supportedValuesOf: (type: string) => string[] }).supportedValuesOf('timeZone')
                : ['UTC'])
        ])
    )
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));

    const filteredTimezoneOptions = timezoneOptions.filter((zone) =>
        zone.toLowerCase().includes(timezoneSearch.toLowerCase())
    );

    const handleSaveCompanySettings = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSavingSettings(true);

        try {
            const response = await fetch(`/api/companies/${company.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(companySettings)
            });

            if (!response.ok) {
                throw new Error('Failed to update company settings');
            }

            onRefresh();
            alert(t('settings.saveChanges') || 'Save changes');
        } catch (error: any) {
            console.error('Error updating company settings:', error);
            alert(error.message || 'Error saving settings');
        } finally {
            setIsSavingSettings(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-12">
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
            />

            {/* Header Profile Section */}
            <ProfileHeader
                title={company.name}
                initials={(company.name?.charAt(0) || '?').toUpperCase()}
                imageUrl={company.logoUrl}
                onLogoClick={handleLogoClick}
                meta={[
                    ...(company.code ? [{ icon: <IdCard className="size-4" />, text: company.code }] : []),
                    { icon: <Mail className="size-4" />, text: company.email || t('settings.noEmail') || 'Sin email' },
                    { icon: <Phone className="size-4" />, text: company.phone || t('settings.noPhone') || 'Sin teléfono' },
                    { text: company.status === 'Active' ? (t('settings.active') || 'Activo') : (t('settings.inactive') || 'Inactivo') }
                ]}
                tabs={[
                    { id: 'Overview', label: t('dashboard.overview') },
                    { id: 'Users', label: t('sidebar.users') },
                    { id: 'Settings', label: t('sidebar.settings') }
                ]}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                onBack={onBack}
                actions={
                    <Button type="button" variant="outline" onClick={() => onEdit(company)}>
                        <Pencil className="size-3.5" /> {t('settings.edit') || 'Editar'}
                    </Button>
                }
            />

            {activeTab === 'Overview' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-bottom-2">
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                        <h3 className="mb-4 border-b border-slate-100 pb-3 text-xs font-bold uppercase tracking-widest text-slate-400">{t('settings.companyDetails') || 'Detalles de la sucursal'}</h3>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Info label={t('settings.code') || 'Código'} value={company.code} />
                            <Info label={t('settings.vatCode') || 'CUIL'} value={company.vatCode} />
                            <Info label={t('settings.type') || 'Tipo'} value={company.type} />
                            <Info label={t('settings.website') || 'Website'} value={company.website} />
                            <Info label={t('settings.language') || 'Idioma'} value={company.language} />
                            <Info label={t('settings.contact') || 'Contacto'} value={company.phone} />
                            <div className="sm:col-span-2"><Info label={t('settings.email') || 'Email'} value={company.email} /></div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
                        <h3 className="mb-4 border-b border-slate-100 pb-3 text-xs font-bold uppercase tracking-widest text-slate-400">{t('settings.address') || 'Dirección'}</h3>
                        <div className="space-y-4">
                            <div className="flex gap-3">
                                <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400">
                                    <i className="fa-solid fa-location-dot"></i>
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-900">{[company.address, company.zipcode].filter(Boolean).join(', ') || '-'}</p>
                                    <p className="text-xs text-slate-500 font-medium">
                                        {[company.zipcode, company.city, company.state, company.country].filter(Boolean).join(', ') || 'Ciudad, Estado, País'}
                                    </p>
                                </div>
                            </div>
                            <div className="overflow-hidden rounded-xl border border-slate-200">
                                <iframe
                                    src={mapEmbedUrl}
                                    title="Company address map"
                                    className="w-full h-52"
                                    loading="lazy"
                                />
                            </div>
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <p className="text-sm text-slate-600 font-medium leading-relaxed">
                                    {company.description || (t('settings.noDescription') || 'Sin descripción disponible.')}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'Users' && (
                <div className="pt-2">
                    <UserManagement companyFilter={company.id} />
                </div>
            )}

            {activeTab === 'Settings' && (
                <form onSubmit={handleSaveCompanySettings} className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm space-y-6 animate-in slide-in-from-bottom-2">
                    <div className="flex items-center gap-4 border-b border-slate-100 pb-4">
                        <h3 className="text-lg font-semibold text-primary">{t('settings.locAndFormats')}</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="space-y-1.5 relative">
                            <label className="block text-sm font-medium text-slate-700">{t('settings.dateFormat')}</label>
                            <div className="relative">
                                <select value={companySettings.dateFormat} onChange={(e) => setCompanySettings(prev => ({ ...prev, dateFormat: e.target.value }))} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-700 appearance-none cursor-pointer">
                                    <option>March 8, 2026</option>
                                    <option>2026/03/08</option>
                                    <option>03/08/2026</option>
                                    <option>08/03/2026</option>
                                    <option>08.03.2026</option>
                                </select>
                                <i className="fa-solid fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-xs"></i>
                            </div>
                        </div>

                        <div className="space-y-1.5 relative">
                            <label className="block text-sm font-medium text-slate-700">{t('settings.timeFormat')}</label>
                            <div className="relative">
                                <select value={companySettings.timeFormat} onChange={(e) => setCompanySettings(prev => ({ ...prev, timeFormat: e.target.value }))} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-700 appearance-none cursor-pointer">
                                    <option>2:19 am</option>
                                    <option>2:19 AM</option>
                                    <option>14:19</option>
                                </select>
                                <i className="fa-solid fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-xs"></i>
                            </div>
                        </div>
                        <div className="space-y-1.5 relative" ref={timezoneDropdownRef}>
                            <label className="block text-sm font-medium text-slate-700">{t('settings.timezone')}</label>
                            <button
                                type="button"
                                onClick={() => setIsTimezoneOpen(prev => !prev)}
                                className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-700 text-left flex items-center justify-between"
                            >
                                <span>{companySettings.timezone || 'UTC'}</span>
                                <i className={`fa-solid fa-chevron-down text-slate-400 text-xs transition-transform ${isTimezoneOpen ? 'rotate-180' : ''}`}></i>
                            </button>
                            {isTimezoneOpen && (
                                <div className="absolute z-20 mt-2 w-full bg-white border border-slate-200 rounded-lg shadow-lg p-2">
                                    <div className="relative mb-2">
                                        <i className="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                                        <input
                                            type="text"
                                            value={timezoneSearch}
                                            onChange={(e) => setTimezoneSearch(e.target.value)}
                                            placeholder="Search timezone..."
                                            className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                        />
                                    </div>
                                    <div className="max-h-56 overflow-y-auto">
                                        {filteredTimezoneOptions.length > 0 ? (
                                            filteredTimezoneOptions.map((zone) => (
                                                <button
                                                    key={zone}
                                                    type="button"
                                                    onClick={() => {
                                                        setCompanySettings(prev => ({ ...prev, timezone: zone }));
                                                        setIsTimezoneOpen(false);
                                                    }}
                                                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${companySettings.timezone === zone ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'}`}
                                                >
                                                    {zone}
                                                </button>
                                            ))
                                        ) : (
                                            <p className="px-3 py-2 text-sm text-slate-400">No timezones found</p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-1.5 relative">
                            <label className="block text-sm font-medium text-slate-700">{t('settings.baseCurrency') || 'Base Currency'}</label>
                            <div className="relative">
                                <select value={companySettings.baseCurrency} onChange={(e) => setCompanySettings(prev => ({ ...prev, baseCurrency: e.target.value }))} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-700 appearance-none cursor-pointer">
                                    {(baseCurrencies.length > 0 ? baseCurrencies : [
                                        { id: 'usd', name: 'USD', code: 'USD' },
                                        { id: 'eur', name: 'EUR', code: 'EUR' },
                                        { id: 'ars', name: 'ARS', code: 'ARS' },
                                        { id: 'clp', name: 'CLP', code: 'CLP' }
                                    ]).map((currency) => (
                                        <option key={currency.id} value={currency.code || currency.name}>{currency.code || currency.name}</option>
                                    ))}
                                </select>
                                <i className="fa-solid fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-xs"></i>
                            </div>
                        </div>

                        <div className="space-y-1.5 relative">
                            <label className="block text-sm font-medium text-slate-700">{t('settings.moneyFormat')}</label>
                            <div className="relative">
                                <select value={companySettings.moneyFormat} onChange={(e) => setCompanySettings(prev => ({ ...prev, moneyFormat: e.target.value }))} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-700 appearance-none cursor-pointer">
                                    <option>1,234.56</option>
                                    <option>1.234,56</option>
                                    <option>1234.56</option>
                                </select>
                                <i className="fa-solid fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-xs"></i>
                            </div>
                        </div>

                        <div className="space-y-1.5 relative">
                            <label className="block text-sm font-medium text-slate-700">{t('settings.currencyPosition')}</label>
                            <div className="relative">
                                <select value={companySettings.currencyPosition} onChange={(e) => setCompanySettings(prev => ({ ...prev, currencyPosition: e.target.value }))} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-700 appearance-none cursor-pointer">
                                    <option>$ 100</option>
                                    <option>100 $</option>
                                </select>
                                <i className="fa-solid fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-xs"></i>
                            </div>
                        </div>

                    </div>
                    <div className="pt-2 flex justify-end">
                        <button type="submit" disabled={isSavingSettings} className={`rounded-lg px-6 py-2 text-sm font-medium shadow-sm transition-all ${isSavingSettings ? 'cursor-not-allowed bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}>
                            {isSavingSettings ? 'Saving...' : (t('settings.saveChanges') || 'Save Changes')}
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
};

export default CompanyProfile;











