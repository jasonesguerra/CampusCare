import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  ArrowUpRight,
  Building2,
  CalendarDays,
  ChevronDown,
  CircleAlert,
  ClipboardList,
  Clock3,
  GraduationCap,
  HardHat,
  ImagePlus,
  LayoutDashboard,
  LogIn,
  LogOut,
  MapPin,
  Menu,
  Package,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  Users,
  UserRound,
  UserPlus,
  Wrench,
  X,
} from 'lucide-react';

const navigation = {
  admin: [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'work-orders', label: 'Work orders', icon: ClipboardList, count: '04' },
    { id: 'facilities', label: 'Facilities', icon: Building2 },
    { id: 'equipment', label: 'Equipment', icon: Wrench },
    { id: 'staff', label: 'Maintenance team', icon: Users },
    { id: 'accounts', label: 'Accounts', icon: UserPlus },
    { id: 'inventory', label: 'Parts inventory', icon: Package },
    { id: 'account', label: 'Manage account', icon: Settings2 },
  ],
  student: [
    { id: 'overview', label: 'Student portal', icon: GraduationCap },
    { id: 'work-orders', label: 'My requests', icon: ClipboardList },
    { id: 'account', label: 'Manage account', icon: Settings2 },
  ],
  staff: [
    { id: 'overview', label: 'Staff workspace', icon: HardHat },
    { id: 'work-orders', label: 'Work requests', icon: ClipboardList },
    { id: 'account', label: 'Manage account', icon: Settings2 },
  ],
};

const pageDetails = {
  overview: ['Campus overview', 'Here is what needs attention across campus today.'],
  'work-orders': ['Work orders', 'Track requests from intake through completion.'],
  facilities: ['Facilities', 'Building conditions and active maintenance by location.'],
  equipment: ['Equipment register', 'Assets, condition, and upcoming service dates.'],
  staff: ['Maintenance team', 'Workload and on-duty coverage for the facilities crew.'],
  accounts: ['Accounts', 'Create maintenance staff logins and review campus accounts.'],
  account: ['Manage account', 'Update your name or password.'],
  inventory: ['Parts inventory', 'Stock levels and items approaching their reorder point.'],
};

const resourceForPage = {
  'work-orders': 'work-orders',
  facilities: 'facilities',
  equipment: 'equipment',
  staff: 'staff',
  accounts: 'users',
  account: 'account',
  inventory: 'inventory',
};

const formatDate = (value) => new Date(`${value}T12:00:00`).toLocaleDateString('en-PH', {
  day: 'numeric',
  month: 'short',
});

const demoAccounts = {
  admin: { label: 'Administrator' },
  student: { label: 'Student' },
  staff: { label: 'Maintenance staff' },
};

function readSession() {
  try {
    return JSON.parse(localStorage.getItem('campuscare-session'));
  } catch {
    return null;
  }
}

function apiFetch(url, session, options = {}) {
  return fetch(url, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${session.token}` },
  });
}

function App() {
  const [page, setPage] = useState('overview');
  const [session, setSession] = useState(readSession);
  const [payload, setPayload] = useState(null);
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const role = session?.user.role;

  useEffect(() => {
    if (!session) {
      setPayload(null);
      setLoading(false);
      return undefined;
    }
    const endpoint = page === 'overview' ? '/api/overview' : `/api/${resourceForPage[page]}`;
    let active = true;
    const loadPage = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await apiFetch(endpoint, session);
        if (response.status === 401) {
          localStorage.removeItem('campuscare-session');
          setSession(null);
          return;
        }
        if (!response.ok) throw new Error('The campus data could not be loaded.');
        let data = await response.json();
        if (page === 'overview' && role !== 'admin') {
          const ordersResponse = await apiFetch('/api/work-orders', session);
          if (ordersResponse.status === 401) {
            localStorage.removeItem('campuscare-session');
            setSession(null);
            return;
          }
          if (!ordersResponse.ok) throw new Error('Your work orders could not be loaded.');
          data = { ...data, workOrders: await ordersResponse.json() };
        }
        if (active) {
          if (data.facilities) setFacilities(data.facilities);
          setPayload(data);
        }
      } catch {
        if (active) setError('Unable to reach the maintenance server. Start the app with npm run dev and try again.');
      } finally {
        if (active) setLoading(false);
      }
    };
    loadPage();
    return () => { active = false; };
  }, [page, refreshKey, role, session]);

  const login = async (credentials) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Unable to sign in.');
    localStorage.setItem('campuscare-session', JSON.stringify(result));
    setPage('overview');
    setSession(result);
  };

  const registerStudent = async (accountDetails) => {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(accountDetails),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Unable to create account.');
    localStorage.setItem('campuscare-session', JSON.stringify(result));
    setPage('overview');
    setSession(result);
  };

  const logout = async () => {
    try {
      await apiFetch('/api/auth/logout', session, { method: 'POST' });
    } finally {
      localStorage.removeItem('campuscare-session');
      setSession(null);
      setPayload(null);
      setPage('overview');
    }
  };

  const goTo = (nextPage) => {
    setPage(nextPage);
    setQuery('');
    setSidebarOpen(false);
  };

  const submitWorkOrder = async (formData) => {
    const response = await apiFetch('/api/work-orders', session, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'The work order could not be saved.');
    setModalOpen(false);
    setPage('work-orders');
    setRefreshKey((key) => key + 1);
  };

  const updateWorkOrder = async (id, changes) => {
    const response = await apiFetch(`/api/work-orders/${id}`, session, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    });
    if (!response.ok) throw new Error('The work order could not be updated.');
    setRefreshKey((key) => key + 1);
  };

  const acceptWorkOrder = async (id) => {
    const response = await apiFetch(`/api/work-orders/${id}/accept`, session, { method: 'POST' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'The request could not be accepted.');
    setRefreshKey((key) => key + 1);
  };

  const deleteWorkOrder = async (id) => {
    const response = await apiFetch(`/api/work-orders/${id}`, session, { method: 'DELETE' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || 'The work request could not be deleted.');
    setRefreshKey((key) => key + 1);
  };

  const createStaffAccount = async (accountDetails) => {
    const response = await apiFetch('/api/users/staff', session, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(accountDetails),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Unable to create maintenance account.');
    setRefreshKey((key) => key + 1);
  };

  const updateAccount = async (changes) => {
    const response = await apiFetch('/api/account', session, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Unable to save account changes.');
    const updatedSession = { ...session, user: result };
    localStorage.setItem('campuscare-session', JSON.stringify(updatedSession));
    setSession(updatedSession);
    setPayload(result);
    return result;
  };

  if (!session) return <LoginScreen onLogin={login} onRegister={registerStudent} />;

  const roleDetails = role === 'admin' ? pageDetails : {
    overview: role === 'student'
      ? ['Student portal', 'Submit maintenance requests and follow their progress.']
      : ['Staff workspace', 'Review and update maintenance work assigned to you.'],
    'work-orders': role === 'student'
      ? ['My requests', 'Track the maintenance requests you have submitted.']
      : ['Work requests', 'Review assigned work and accept unassigned requests.'],
    account: ['Manage account', 'Update your name or password.'],
  };
  const [title, subtitle] = roleDetails[page];
  const roleNavigation = navigation[role] ?? navigation.admin;
  const headerDate = new Intl.DateTimeFormat('en-PH', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }).format(new Date());

  return (
    <div className="app-shell">
      {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup">
          <img src="/ua-logo.png" alt="University of the Assumption" />
          <div className="brand-divider" />
          <div className="brand-copy"><strong>CampusCare</strong><span>FACILITIES OPERATIONS</span></div>
        </div>

        <div className="workspace-label">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Main navigation">
          {roleNavigation.map(({ id, label, icon: Icon, count }) => (
            <button key={id} className={`nav-link ${page === id ? 'nav-link-active' : ''}`} onClick={() => goTo(id)}>
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
              {count && <span className="nav-count">{count}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="campus-status"><span className="status-dot" /><span>Campus operations active</span></div>
          <div className="profile-button">
            <span className="avatar avatar-gold">{initials(session.user.name)}</span>
            <span className="profile-copy"><strong>{session.user.name}</strong><small>{demoAccounts[role]?.label}</small></span>
            <button className="profile-logout" title="Sign out" aria-label="Sign out" onClick={logout}><LogOut size={16} /></button>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={19} /></button>
          <div className="topbar-crumb"><span>Facilities</span><span className="crumb-slash">/</span><strong>{title}</strong></div>
          <div className="topbar-tools">
            <label className="global-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this view" aria-label="Search current view" /></label>
            <span className="topbar-divider" />
            <span className="today-label">{headerDate}</span>
          </div>
        </header>

        <section className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> UA CAMPUS SERVICES</div>
              <h1>{title}</h1>
              <p>{subtitle}</p>
            </div>
            <div className="heading-actions">
              {page === 'work-orders' && role !== 'staff' && <button className="button button-primary" onClick={() => setModalOpen(true)}><Plus size={17} /> {role === 'student' ? 'New request' : 'New work order'}</button>}
              {page === 'overview' && role !== 'staff' && <button className="button button-primary" onClick={() => setModalOpen(true)}><Plus size={17} /> {role === 'student' ? 'Report an issue' : 'Create request'}</button>}
              {page !== 'overview' && page !== 'work-orders' && page !== 'account' && <span className="record-count"><Activity size={15} /> {Array.isArray(payload) ? payload.length : 0} records</span>}
            </div>
          </div>

          {error ? <div className="error-state"><CircleAlert size={20} /><span>{error}</span><button className="button button-quiet" onClick={() => setRefreshKey((key) => key + 1)}>Retry</button></div> : null}
          {loading && !payload ? <div className="loading-state"><span className="loading-mark" /> Loading campus data</div> : null}

          {!loading && !error && page === 'overview' && payload && role === 'admin' && <Overview data={payload} query={query} onNavigate={goTo} onUpdate={updateWorkOrder} />}
          {!loading && !error && page === 'overview' && payload && role === 'student' && <StudentPortal user={session.user} orders={payload.workOrders} query={query} />}
          {!loading && !error && page === 'overview' && payload && role === 'staff' && <StaffPortal user={session.user} orders={payload.workOrders} query={query} onUpdate={updateWorkOrder} onAccept={acceptWorkOrder} onDelete={deleteWorkOrder} />}
          {!loading && !error && page === 'work-orders' && Array.isArray(payload) && <WorkOrders orders={payload} query={query} onUpdate={updateWorkOrder} onAccept={role === 'staff' ? acceptWorkOrder : undefined} onDelete={role === 'staff' || role === 'admin' ? deleteWorkOrder : undefined} readOnly={role === 'student'} />}
          {!loading && !error && page === 'facilities' && Array.isArray(payload) && <Facilities facilities={filterRecords(payload, query)} session={session} />}
          {!loading && !error && page === 'equipment' && Array.isArray(payload) && <Equipment equipment={filterRecords(payload, query)} />}
          {!loading && !error && page === 'staff' && Array.isArray(payload) && <Team staff={filterRecords(payload, query)} />}
          {!loading && !error && page === 'accounts' && Array.isArray(payload) && role === 'admin' && <Accounts accounts={filterRecords(payload, query)} onCreate={createStaffAccount} />}
          {!loading && !error && page === 'account' && payload && <AccountSettings key={session.user.id} user={payload} onSave={updateAccount} />}
          {!loading && !error && page === 'inventory' && Array.isArray(payload) && <Inventory inventory={filterRecords(payload, query)} />}

          <footer className="page-footer"><span>University of the Assumption</span><span>CampusCare <b>·</b> Facilities management</span></footer>
        </section>
      </main>

      {modalOpen && <WorkOrderModal facilities={facilities} onClose={() => setModalOpen(false)} onSubmit={submitWorkOrder} />}
    </div>
  );
}

function LoginScreen({ onLogin, onRegister }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '' });
  const [registration, setRegistration] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      if (mode === 'register') {
        if (registration.password !== registration.confirmPassword) throw new Error('Passwords do not match.');
        await onRegister({ name: registration.name, email: registration.email, password: registration.password });
      } else {
        await onLogin({ email: form.email, password: form.password });
      }
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-shell">
      <section className="login-aside">
        <div className="login-brand"><img src="/ua-logo.png" alt="University of the Assumption" /><span>CampusCare</span></div>
        <div className="login-aside-copy"><span className="login-kicker">UNIVERSITY OF THE ASSUMPTION</span><h1>Campus spaces,<br />cared for.</h1><p>Facilities requests and maintenance, connected in one campus workspace.</p></div>
        <div className="login-aside-footer"><span className="status-dot" /> Facilities operations portal <span>EST. 1963</span></div>
      </section>
      <section className="login-main">
        <form className="login-form" onSubmit={submit}>
          <div className="login-heading"><span className="login-icon"><UserRound size={19} /></span><span className="section-kicker">CAMPUSCARE ACCESS</span><h2>{mode === 'register' ? 'Create your student account' : 'Sign in to your account'}</h2><p>{mode === 'register' ? 'Register to submit and track campus requests.' : 'Enter your email and password to continue.'}</p></div>
          {mode === 'register' && <label className="login-field"><span>Full name</span><input autoComplete="name" required minLength="2" maxLength="80" value={registration.name} onChange={(event) => setRegistration((current) => ({ ...current, name: event.target.value }))} /></label>}
          <label className="login-field"><span>Email address</span><input type="email" autoComplete="username" required value={mode === 'register' ? registration.email : form.email} onChange={(event) => mode === 'register' ? setRegistration((current) => ({ ...current, email: event.target.value })) : setForm((current) => ({ ...current, email: event.target.value }))} /></label>
          <label className="login-field"><span>Password</span><input type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required minLength={mode === 'register' ? 8 : undefined} value={mode === 'register' ? registration.password : form.password} onChange={(event) => mode === 'register' ? setRegistration((current) => ({ ...current, password: event.target.value })) : setForm((current) => ({ ...current, password: event.target.value }))} /></label>
          {mode === 'register' && <label className="login-field"><span>Confirm password</span><input type="password" autoComplete="new-password" required minLength="8" value={registration.confirmPassword} onChange={(event) => setRegistration((current) => ({ ...current, confirmPassword: event.target.value }))} /></label>}
          {error && <div className="login-error" role="alert">{error}</div>}
          <button className="login-submit" type="submit" disabled={submitting}>{submitting ? 'Please wait…' : <>{mode === 'register' ? 'Create account' : 'Sign in'} <LogIn size={17} /></>}</button>
          <div className="login-mode-switch">{mode === 'register' ? <>Already registered? <button type="button" onClick={() => { setMode('login'); setError(''); }}>Sign in</button></> : <>New student? <button type="button" onClick={() => { setMode('register'); setError(''); }}>Create a student account</button></>}</div>
        </form>
        <footer className="login-footer">University of the Assumption <span>CampusCare Facilities Management</span></footer>
      </section>
    </main>
  );
}

function AccountSettings({ user, onSave }) {
  const [name, setName] = useState(user.name);
  const [changePassword, setChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const changes = { name };
      if (changePassword) {
        if (newPassword !== confirmPassword) throw new Error('New passwords do not match.');
        changes.currentPassword = currentPassword;
        changes.newPassword = newPassword;
      }
      const updatedUser = await onSave(changes);
      setName(updatedUser.name);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setChangePassword(false);
      setSuccess('Account information updated.');
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="account-settings-layout">
      <section className="panel account-settings-panel">
        <div className="panel-heading"><div><div className="section-kicker">PERSONAL ACCOUNT</div><h2>Profile information</h2></div><span className="resource-icon resource-building"><Settings2 size={18} /></span></div>
        <form className="account-settings-form" onSubmit={submit}>
          <label className="form-field"><span>Full name</span><input required minLength="2" maxLength="80" value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="form-field"><span>Email address</span><input type="email" value={user.email} readOnly aria-describedby="email-locked-note" /><small id="email-locked-note">Email address cannot be changed.</small></label>
          <label className="form-field"><span>Account type</span><input value={user.role === 'staff' ? 'Maintenance staff' : user.role} readOnly /></label>
          <label className="password-toggle"><input type="checkbox" checked={changePassword} onChange={(event) => setChangePassword(event.target.checked)} /><span>Change password</span></label>
          {changePassword && <div className="password-change-fields">
            <label className="form-field"><span>Current password</span><input type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
            <label className="form-field"><span>New password</span><input type="password" autoComplete="new-password" required minLength="8" maxLength="128" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /><small>Use 8 to 128 characters.</small></label>
            <label className="form-field"><span>Confirm new password</span><input type="password" autoComplete="new-password" required minLength="8" maxLength="128" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
          </div>}
          {error && <div className="form-error"><CircleAlert size={15} />{error}</div>}
          {success && <div className="account-success"><ShieldCheck size={15} />{success}</div>}
          <div className="modal-actions"><button className="button button-primary" type="submit" disabled={saving}><ShieldCheck size={15} />{saving ? 'Saving…' : 'Save changes'}</button></div>
        </form>
      </section>
    </div>
  );
}

function Accounts({ accounts, onCreate }) {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await onCreate(form);
      setForm({ name: '', email: '', password: '' });
      setSuccess('Maintenance staff account created.');
    } catch (createError) {
      setError(createError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="accounts-layout">
      <section className="panel account-create-panel">
        <div className="panel-heading"><div><div className="section-kicker">ADMINISTRATOR ACTION</div><h2>Create maintenance staff account</h2></div><span className="resource-icon resource-building"><UserPlus size={18} /></span></div>
        <form className="account-create-form" onSubmit={submit}>
          <label className="form-field"><span>Staff member name</span><input required minLength="2" maxLength="80" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
          <label className="form-field"><span>Work email</span><input type="email" required maxLength="120" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></label>
          <label className="form-field"><span>Temporary password</span><input type="password" required minLength="8" maxLength="128" autoComplete="new-password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} /><small>At least 8 characters. Share it directly with the staff member.</small></label>
          {error && <div className="form-error"><CircleAlert size={15} />{error}</div>}
          {success && <div className="account-success"><ShieldCheck size={15} />{success}</div>}
          <div className="modal-actions"><button className="button button-primary" type="submit" disabled={saving}><UserPlus size={15} />{saving ? 'Creating…' : 'Create staff account'}</button></div>
        </form>
      </section>
      <section className="panel full-panel account-list-panel">
        <div className="table-toolbar"><div><div className="section-kicker">CAMPUSCARE USERS</div><h2>Accounts <span className="count-badge">{accounts.length}</span></h2></div></div>
        <div className="table-scroll"><table className="data-table resource-table"><thead><tr><th>Name</th><th>Email</th><th>Account type</th><th>Created</th></tr></thead><tbody>
          {accounts.map((account) => <tr key={account.id}><td><div className="resource-name"><span className="avatar">{initials(account.name)}</span><span><strong>{account.name}</strong><small>{account.id}</small></span></div></td><td>{account.email}</td><td><span className={`account-role account-role-${account.role}`}>{account.role === 'staff' ? 'Maintenance staff' : account.role}</span></td><td>{new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(account.createdAt))}</td></tr>)}
          {!accounts.length && <tr><td colSpan="4" className="empty-cell">No accounts found.</td></tr>}
        </tbody></table></div>
      </section>
    </div>
  );
}

function StudentPortal({ user, orders, query }) {
  const visibleOrders = filterRecords(orders, query);
  const openCount = visibleOrders.filter((order) => order.status !== 'Completed').length;
  const completedCount = visibleOrders.length - openCount;
  return (
    <div className="portal-layout">
      <section className="portal-welcome student-welcome"><div><span className="section-kicker">STUDENT SERVICES</span><h2>Welcome, {user.name.split(' ')[0]}</h2><p>Tell us what needs attention on campus. Your requests stay here so you can check progress.</p></div></section>
      <div className="portal-stats"><PortalStat label="My requests" value={visibleOrders.length} icon={ClipboardList} /><PortalStat label="Being worked on" value={openCount} icon={Wrench} /><PortalStat label="Completed" value={completedCount} icon={ShieldCheck} /></div>
      <section className="panel portal-orders"><div className="panel-heading"><div><div className="section-kicker">REQUEST HISTORY</div><h2>My maintenance requests</h2></div><span className="count-badge">{visibleOrders.length}</span></div><WorkOrderTable orders={visibleOrders} readOnly /></section>
    </div>
  );
}

function StaffPortal({ user, orders, query, onUpdate, onAccept, onDelete }) {
  const visibleOrders = filterRecords(orders, query);
  const assignedOrders = visibleOrders.filter((order) => order.assignedTo === user.name);
  const availableOrders = visibleOrders.filter((order) => order.assignedTo === 'Unassigned');
  const activeCount = assignedOrders.filter((order) => order.status !== 'Completed').length;
  return (
    <div className="portal-layout">
      <section className="portal-welcome staff-welcome"><div><span className="section-kicker">MAINTENANCE CREW</span><h2>Good day, {user.name.split(' ')[0]}</h2><p>Check work assigned to you or accept an unassigned campus request.</p></div><span className="staff-duty"><i /> On duty</span></section>
      <div className="portal-stats"><PortalStat label="Assigned to me" value={assignedOrders.length} icon={ClipboardList} /><PortalStat label="Available requests" value={availableOrders.length} icon={ImagePlus} /><PortalStat label="Active work" value={activeCount} icon={Wrench} /></div>
      <section className="panel portal-orders"><div className="panel-heading"><div><div className="section-kicker">MY ASSIGNMENTS</div><h2>Assigned work orders</h2></div><span className="count-badge">{assignedOrders.length}</span></div><WorkOrderTable orders={assignedOrders} onUpdate={onUpdate} onDelete={onDelete} /></section>
      <section className="panel portal-orders"><div className="panel-heading"><div><div className="section-kicker">OPEN REQUESTS</div><h2>Available to accept</h2></div><span className="count-badge">{availableOrders.length}</span></div><WorkOrderTable orders={availableOrders} onAccept={onAccept} onDelete={onDelete} readOnly /></section>
    </div>
  );
}

function PortalStat({ label, value, icon: Icon }) {
  return <div className="portal-stat"><span className="portal-stat-icon"><Icon size={17} /></span><span><small>{label}</small><strong>{value}</strong></span></div>;
}

function filterRecords(records, query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return records;
  return records.filter((record) => Object.values(record).some((value) => String(value).toLowerCase().includes(normalized)));
}

function Overview({ data, query, onNavigate, onUpdate }) {
  const stats = [
    { label: 'Open work orders', value: data.openOrders, detail: 'Across campus', icon: ClipboardList, tone: 'blue', page: 'work-orders' },
    { label: 'In progress', value: data.inProgress, detail: 'Being worked on', icon: Wrench, tone: 'teal', page: 'work-orders' },
    { label: 'Overdue', value: data.overdue, detail: 'Needs follow-up', icon: CircleAlert, tone: 'red', page: 'work-orders' },
    { label: 'Active equipment', value: data.activeEquipment, detail: 'In service', icon: HardHat, tone: 'gold', page: 'equipment' },
  ];
  const visibleWorkOrders = filterRecords(data.workOrders, query);
  const visibleFacilities = filterRecords(data.facilities, query);
  const urgentCount = visibleWorkOrders.filter((order) => order.priority === 'Urgent' && order.status !== 'Completed').length;

  return (
    <>
      <div className="overview-intro">
        <div className="welcome-note"><span className="welcome-icon"><CalendarDays size={17} /></span><span><strong>Good morning, Angelo</strong><small>Here is your campus maintenance snapshot.</small></span></div>
        <div className="snapshot-date"><span className="snapshot-dot" /> LIVE OPERATIONS</div>
      </div>

      <div className="metric-grid">
        {stats.map(({ label, value, detail, icon: Icon, tone, page }) => (
          <button className="metric-card" key={label} onClick={() => onNavigate(page)}>
            <div className="metric-top"><span>{label}</span><span className={`metric-icon metric-${tone}`}><Icon size={17} /></span></div>
            <div className="metric-value-row"><strong>{value}</strong><span>{detail}</span></div>
            <div className="metric-foot"><span>View details</span><ArrowUpRight size={14} /></div>
          </button>
        ))}
      </div>

      <div className="dashboard-grid">
        <section className="panel work-panel">
          <div className="panel-heading">
            <div><div className="section-kicker">ACTION QUEUE</div><h2>Recent work orders</h2></div>
            <button className="text-button" onClick={() => onNavigate('work-orders')}>View all <ArrowUpRight size={15} /></button>
          </div>
          <WorkOrderTable orders={visibleWorkOrders} compact onUpdate={onUpdate} />
        </section>

        <aside className="overview-rail">
          <section className="attention-panel">
            <div className="attention-top"><span className="attention-icon"><CircleAlert size={18} /></span><span className="attention-label">NEEDS ATTENTION</span></div>
            <strong className="attention-number">{urgentCount.toString().padStart(2, '0')}<small> urgent</small></strong>
            <p>{urgentCount ? 'A high-impact request is waiting for assignment.' : 'No urgent requests in the queue.'}</p>
            <button className="attention-link" onClick={() => onNavigate('work-orders')}>Review priority queue <ArrowUpRight size={14} /></button>
          </section>

          <section className="panel facility-panel">
            <div className="panel-heading panel-heading-tight"><div><div className="section-kicker">CAMPUS FOOTPRINT</div><h2>Facility pulse</h2></div><Building2 size={19} className="heading-icon" /></div>
            <div className="facility-summary"><strong>{visibleFacilities.length.toString().padStart(2, '0')}</strong><span>managed buildings</span></div>
            <div className="facility-list">
              {visibleFacilities.slice(0, 4).map((facility) => (
                <div className="facility-row" key={facility.id}>
                  <span className={`facility-indicator ${facility.condition === 'Attention' ? 'indicator-attention' : ''}`} />
                  <span className="facility-name">{facility.name}</span>
                  <span className="facility-open">{facility.openOrders} <small>open</small></span>
                </div>
              ))}
            </div>
            <button className="facility-link" onClick={() => onNavigate('facilities')}>Explore facilities <ArrowUpRight size={14} /></button>
          </section>

          <div className="service-note"><ShieldCheck size={17} /><span><strong>Service continuity</strong><small>Facilities team on duty</small></span><span className="service-pulse" /></div>
        </aside>
      </div>
    </>
  );
}

function WorkOrders({ orders, query, onUpdate, onAccept, onDelete, readOnly = false }) {
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [priorityFilter, setPriorityFilter] = useState('All priorities');
  const visibleOrders = orders.filter((order) => {
    const matchesQuery = filterRecords([order], query).length > 0;
    return matchesQuery && (statusFilter === 'All statuses' || order.status === statusFilter) && (priorityFilter === 'All priorities' || order.priority === priorityFilter);
  });

  return (
    <section className="panel table-panel full-panel">
      <div className="table-toolbar">
        <div><div className="section-kicker">MAINTENANCE LOG</div><h2>All requests <span className="count-badge">{visibleOrders.length}</span></h2></div>
        <div className="filter-controls">
          <label><span className="sr-only">Filter by status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All statuses</option><option>Requested</option><option>In progress</option><option>Scheduled</option><option>Completed</option></select><ChevronDown size={14} /></label>
          <label><span className="sr-only">Filter by priority</span><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option>All priorities</option><option>Urgent</option><option>High</option><option>Medium</option><option>Low</option></select><ChevronDown size={14} /></label>
        </div>
      </div>
      <WorkOrderTable orders={visibleOrders} onUpdate={onUpdate} onAccept={onAccept} onDelete={onDelete} readOnly={readOnly} />
      <div className="table-footnote"><span><span className="status-dot status-dot-small" /> Data saved to the local maintenance store</span><span>Updated just now</span></div>
    </section>
  );
}

function WorkOrderTable({ orders, compact = false, onUpdate, onAccept, onDelete, readOnly = false }) {
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const handleStatusChange = async (id, status) => {
    try {
      await onUpdate(id, { status });
    } catch (error) {
      window.alert(error.message);
    }
  };

  const handleAccept = async (event, id) => {
    event.stopPropagation();
    try {
      await onAccept(id);
    } catch (error) {
      window.alert(error.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await onDelete(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <>
      <div className={`table-scroll ${compact ? 'table-scroll-compact' : ''}`}>
      <table className="data-table work-order-table">
        <thead><tr><th>Request</th><th>Facility</th><th>Priority</th><th>Assigned to</th><th>Due date</th><th>Status</th>{onDelete && <th aria-label="Actions">Actions</th>}</tr></thead>
        <tbody>
          {orders.length ? orders.map((order) => (
            <tr key={order.id} className="work-order-row" tabIndex={0} onClick={() => setSelectedOrder(order)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setSelectedOrder(order); } }}>
              <td><div className="request-cell"><span className="request-id">{order.id}</span><strong>{order.title}</strong><small>{order.category}</small></div></td>
              <td className="facility-cell"><span className="facility-primary">{order.facility}</span><small className="facility-room">{order.floor ? `Floor ${order.floor} · Room ${order.roomNumber}` : 'Room not specified'}</small></td>
              <td><PriorityBadge priority={order.priority} /></td>
              <td>{onAccept && order.assignedTo === 'Unassigned' ? <button className="accept-request" onClick={(event) => handleAccept(event, order.id)}>Accept</button> : <Assignee value={order.assignedTo} />}</td>
              <td><span className={`due-date ${order.status !== 'Completed' && order.dueAt < new Date().toISOString().slice(0, 10) ? 'due-overdue' : ''}`}><Clock3 size={13} />{formatDate(order.dueAt)}</span></td>
              <td>{readOnly || (onAccept && order.assignedTo === 'Unassigned') ? <span className={`status-readonly status-${slug(order.status)}`}>{order.status}</span> : <select className={`status-select status-${slug(order.status)}`} aria-label={`Update status for ${order.id}`} value={order.status} onClick={(event) => event.stopPropagation()} onChange={(event) => handleStatusChange(order.id, event.target.value)}><option>Requested</option><option>In progress</option><option>Scheduled</option><option>Completed</option></select>}</td>
              {onDelete && <td><button type="button" className="delete-request-button" aria-label={`Delete ${order.id}`} title={`Delete ${order.id}`} onClick={(event) => { event.stopPropagation(); setDeleteTarget(order); }}><Trash2 size={15} /></button></td>}
            </tr>
          )) : <tr><td colSpan={onDelete ? 7 : 6} className="empty-cell">No work orders match these filters.</td></tr>}
        </tbody>
      </table>
      </div>
      {selectedOrder && <WorkOrderDetailsModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
      {deleteTarget && <DeleteWorkOrderModal order={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} />}
    </>
  );
}

function Facilities({ facilities, session }) {
  const [selectedFacility, setSelectedFacility] = useState(null);
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState('');

  useEffect(() => {
    if (!selectedFacility) return undefined;
    let active = true;
    const loadOrders = async () => {
      setOrdersLoading(true);
      setOrdersError('');
      try {
        const response = await apiFetch('/api/work-orders', session);
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Unable to load work requests.');
        if (active) setOrders(data.filter((order) => order.facility === selectedFacility.name));
      } catch (loadError) {
        if (active) setOrdersError(loadError.message);
      } finally {
        if (active) setOrdersLoading(false);
      }
    };
    loadOrders();
    return () => { active = false; };
  }, [selectedFacility, session]);

  return (
    <>
    <section className="panel table-panel full-panel">
      <div className="table-toolbar"><div><div className="section-kicker">BUILDING DIRECTORY</div><h2>Campus facilities <span className="count-badge">{facilities.length}</span></h2></div><span className="table-meta"><MapPin size={15} /> University of the Assumption</span></div>
      <div className="table-scroll"><table className="data-table resource-table"><thead><tr><th>Facility</th><th>Type</th><th>Campus zone</th><th>Floor area</th><th>Condition</th><th>Open orders</th></tr></thead><tbody>
        {facilities.map((facility) => <tr key={facility.id} className="facility-click-row" tabIndex={0} onClick={() => setSelectedFacility(facility)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedFacility(facility); } }}><td><div className="resource-name"><span className="resource-icon resource-building"><Building2 size={17} /></span><span><strong>{facility.name}</strong><small>{facility.id}</small></span></div></td><td>{facility.type}</td><td>{facility.location}</td><td>{facility.area}</td><td><ConditionBadge value={facility.condition} /></td><td><span className="order-count">{facility.openOrders}</span></td></tr>)}
        {!facilities.length && <tr><td colSpan="6" className="empty-cell">No facilities match your search.</td></tr>}
      </tbody></table></div>
    </section>
    {selectedFacility && <FacilityOrdersModal facility={selectedFacility} orders={orders} loading={ordersLoading} error={ordersError} onClose={() => setSelectedFacility(null)} />}
    </>
  );
}

function FacilityOrdersModal({ facility, orders, loading, error, onClose }) {
  const locations = orders.reduce((groups, order) => {
    const key = `Floor ${order.floor || '—'} · Room ${order.roomNumber || '—'}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(order);
    return groups;
  }, {});

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal facility-orders-modal" role="dialog" aria-modal="true" aria-labelledby="facility-orders-title">
        <div className="modal-heading"><div><div className="section-kicker">{facility.location}</div><h2 id="facility-orders-title">{facility.name}</h2></div><button className="icon-button modal-close" aria-label="Close facility details" onClick={onClose}><X size={19} /></button></div>
        <div className="facility-modal-summary"><div><small>Open requests</small><strong>{orders.filter((order) => order.status !== 'Completed').length}</strong></div><div><small>Total requests</small><strong>{orders.length}</strong></div><div><small>Condition</small><strong><ConditionBadge value={facility.condition} /></strong></div></div>
        {loading && <div className="loading-state facility-modal-loading">Loading work requests</div>}
        {error && <div className="form-error"><CircleAlert size={15} />{error}</div>}
        {!loading && !error && (orders.length ? <div className="facility-location-list">{Object.entries(locations).map(([location, locationOrders]) => <section className="facility-location-group" key={location}><div className="facility-location-heading"><span><MapPin size={14} /> {location}</span><span className="count-badge">{locationOrders.length}</span></div><div className="facility-location-orders">{locationOrders.map((order) => <article className="facility-location-order" key={order.id}><div><span className="request-id">{order.id}</span><strong>{order.title}</strong><small>{order.category}</small></div><div><PriorityBadge priority={order.priority} /><span className={`status-readonly status-${slug(order.status)}`}>{order.status}</span></div></article>)}</div></section>)}</div> : <div className="empty-state">No work requests in this facility.</div>)}
        <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Close</button></div>
      </section>
    </div>,
    document.body,
  );
}

function Equipment({ equipment }) {
  return (
    <section className="panel table-panel full-panel">
      <div className="table-toolbar"><div><div className="section-kicker">ASSET REGISTER</div><h2>Campus equipment <span className="count-badge">{equipment.length}</span></h2></div><span className="table-meta"><Wrench size={15} /> Preventive service schedule</span></div>
      <div className="table-scroll"><table className="data-table resource-table"><thead><tr><th>Asset</th><th>Tag</th><th>Facility / location</th><th>Condition</th><th>Next service</th></tr></thead><tbody>
        {equipment.map((item) => <tr key={item.id}><td><div className="resource-name"><span className="resource-icon resource-equipment"><Wrench size={17} /></span><span><strong>{item.name}</strong><small>{item.id}</small></span></div></td><td><span className="asset-tag">{item.assetTag}</span></td><td><strong className="location-primary">{item.facility}</strong><small className="location-secondary">{item.location}</small></td><td><ConditionBadge value={item.condition} /></td><td><span className="due-date"><CalendarDays size={13} />{formatDate(item.nextService)}</span></td></tr>)}
        {!equipment.length && <tr><td colSpan="5" className="empty-cell">No equipment matches your search.</td></tr>}
      </tbody></table></div>
    </section>
  );
}

function Team({ staff }) {
  return (
    <section className="team-section">
      <div className="team-summary"><div><div className="section-kicker">FIELD OPERATIONS</div><h2>On-duty crew</h2></div><span className="crew-count"><span className="status-dot" /> {staff.length} team members</span></div>
      <div className="team-grid">
        {staff.map((person, index) => {
          const activeOrders = Number(person.activeOrders) || 0;
          return <article className="team-member" key={person.id}>
          <div className="team-card-top"><span className={`avatar avatar-large avatar-tone-${index % 4}`}>{initials(person.name)}</span><span className="duty-status"><i />{person.status}</span></div>
          <div className="team-person"><h3>{person.name}</h3><p>{person.role}</p></div>
          <div className="team-assignment"><span>Active assignments</span><strong>{activeOrders.toString().padStart(2, '0')}</strong></div>
          <div className="team-card-bottom"><span>{person.id}</span><span>Facilities crew</span></div>
        </article>;
        })}
        {!staff.length && <div className="empty-state">No team members match your search.</div>}
      </div>
    </section>
  );
}

function Inventory({ inventory }) {
  const lowStock = inventory.filter((item) => item.quantity <= item.reorderAt).length;
  return (
    <section className="panel table-panel full-panel">
      <div className="table-toolbar"><div><div className="section-kicker">STORES &amp; SUPPLIES</div><h2>Parts inventory <span className="count-badge">{inventory.length}</span></h2></div><span className={`stock-alert ${lowStock ? '' : 'stock-ok'}`}><CircleAlert size={15} /> {lowStock} low-stock items</span></div>
      <div className="table-scroll"><table className="data-table resource-table"><thead><tr><th>Part</th><th>SKU</th><th>Stock on hand</th><th>Reorder point</th><th>Storage location</th></tr></thead><tbody>
        {inventory.map((item) => { const isLow = item.quantity <= item.reorderAt; return <tr key={item.id}><td><div className="resource-name"><span className="resource-icon resource-parts"><Package size={17} /></span><span><strong>{item.name}</strong><small>{item.id}</small></span></div></td><td><span className="asset-tag">{item.sku}</span></td><td><span className={`stock-quantity ${isLow ? 'quantity-low' : ''}`}>{item.quantity} <small>{item.unit}</small></span></td><td>{item.reorderAt} {item.unit}</td><td>{item.location}</td></tr>; })}
        {!inventory.length && <tr><td colSpan="5" className="empty-cell">No parts match your search.</td></tr>}
      </tbody></table></div>
    </section>
  );
}

function WorkOrderModal({ facilities, onClose, onSubmit }) {
  const [form, setForm] = useState({ title: '', facility: facilities[0]?.name ?? '', floor: '1', roomNumber: '01', category: 'Electrical', priority: 'Medium', description: '' });
  const [images, setImages] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const attachments = await Promise.all(images.map(async (image) => ({
        name: image.name,
        type: image.type,
        data: await fileToDataUrl(image),
      })));
      await onSubmit({ ...form, images: attachments });
    } catch (submissionError) {
      setError(submissionError.message);
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-heading"><div><div className="section-kicker">REQUEST INTAKE</div><h2 id="modal-title">New work order</h2></div><button className="icon-button modal-close" aria-label="Close dialog" onClick={onClose}><X size={19} /></button></div>
        <form onSubmit={submit}>
          <label className="form-field"><span>Request title <b>*</b></span><input autoFocus required maxLength="100" value={form.title} onChange={(event) => setField('title', event.target.value)} placeholder="e.g. Repair classroom door" /></label>
          <label className="form-field"><span>Facility <b>*</b></span><select required value={form.facility} onChange={(event) => setField('facility', event.target.value)}>{facilities.map((facility) => <option key={facility.id}>{facility.name}</option>)}</select></label>
          <div className="form-row">
            <label className="form-field"><span>Floor <b>*</b></span><select required value={form.floor} onChange={(event) => setField('floor', event.target.value)}>{[1, 2, 3].map((floor) => <option key={floor} value={floor}>Floor {floor}</option>)}</select></label>
            <label className="form-field"><span>Room number <b>*</b></span><select required value={form.roomNumber} onChange={(event) => setField('roomNumber', event.target.value)}>{Array.from({ length: 8 }, (_value, index) => String(index + 1).padStart(2, '0')).map((room) => <option key={room} value={room}>Room {room}</option>)}</select></label>
          </div>
          <div className="form-row">
            <label className="form-field"><span>Category <b>*</b></span><select value={form.category} onChange={(event) => setField('category', event.target.value)}>{['Electrical', 'HVAC', 'Plumbing', 'Carpentry', 'Equipment', 'Grounds', 'Other'].map((category) => <option key={category}>{category}</option>)}</select></label>
            <label className="form-field"><span>Priority</span><select value={form.priority} onChange={(event) => setField('priority', event.target.value)}>{['Low', 'Medium', 'High', 'Urgent'].map((priority) => <option key={priority}>{priority}</option>)}</select></label>
          </div>
          <label className="form-field"><span>Description</span><textarea rows="3" maxLength="500" value={form.description} onChange={(event) => setField('description', event.target.value)} placeholder="Add details about the issue or location" /></label>
          <label className="form-field image-upload-field"><span>Equipment photos</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => {
            const selected = Array.from(event.target.files ?? []);
            const invalid = selected.length > 3 || selected.some((image) => !['image/jpeg', 'image/png', 'image/webp'].includes(image.type) || image.size > 3 * 1024 * 1024);
            if (invalid) {
              setError('Choose up to 3 PNG, JPEG, or WebP images, each 3 MB or smaller.');
              event.target.value = '';
              return;
            }
            setError('');
            setImages(selected);
          }} /><small>Up to 3 images · PNG, JPEG, or WebP · 3 MB each</small></label>
          {!!images.length && <ul className="image-file-list">{images.map((image, index) => <li key={`${image.name}-${index}`}><ImagePlus size={14} /><span>{image.name}</span><button type="button" title={`Remove ${image.name}`} aria-label={`Remove ${image.name}`} onClick={() => setImages((current) => current.filter((_item, itemIndex) => itemIndex !== index))}><X size={13} /></button></li>)}</ul>}
          {error && <div className="form-error"><CircleAlert size={15} />{error}</div>}
          <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? 'Saving…' : <><Plus size={16} /> Create request</>}</button></div>
        </form>
      </section>
    </div>,
    document.body,
  );
}

function DeleteWorkOrderModal({ order, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const confirmDelete = async () => {
    setDeleting(true);
    setError('');
    try {
      await onConfirm();
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setDeleting(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) onClose(); }}>
      <section className="modal delete-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-confirm-title" aria-describedby="delete-confirm-description">
        <div className="modal-heading"><div><div className="section-kicker">CONFIRM DELETION</div><h2 id="delete-confirm-title">Delete work request?</h2></div><button className="icon-button modal-close" aria-label="Close deletion confirmation" disabled={deleting} onClick={onClose}><X size={19} /></button></div>
        <div className="delete-confirm-copy" id="delete-confirm-description"><span className="delete-confirm-icon"><Trash2 size={20} /></span><p><strong>{order.title}</strong><br /><span>{order.id} · This action cannot be undone.</span></p></div>
        {error && <div className="form-error"><CircleAlert size={15} />{error}</div>}
        <div className="modal-actions"><button type="button" className="button button-secondary" disabled={deleting} onClick={onClose}>Cancel</button><button type="button" className="button button-danger" disabled={deleting} onClick={confirmDelete}>{deleting ? 'Deleting…' : <><Trash2 size={15} /> Delete request</>}</button></div>
      </section>
    </div>,
    document.body,
  );
}

function WorkOrderDetailsModal({ order, onClose }) {
  const images = Array.isArray(order.images) ? order.images : [];
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal request-details-modal" role="dialog" aria-modal="true" aria-labelledby="request-details-title">
        <div className="modal-heading"><div><div className="section-kicker">WORK REQUEST · {order.id}</div><h2 id="request-details-title">{order.title}</h2></div><button className="icon-button modal-close" aria-label="Close request details" onClick={onClose}><X size={19} /></button></div>
        <div className="request-detail-grid">
          <div><small>Facility</small><strong>{order.facility}</strong></div>
          <div><small>Location</small><strong>Floor {order.floor || '—'} · Room {order.roomNumber || '—'}</strong></div>
          <div><small>Category</small><strong>{order.category}</strong></div>
          <div><small>Priority</small><strong><PriorityBadge priority={order.priority} /></strong></div>
          <div><small>Reported by</small><strong>{order.reportedBy || '—'}</strong></div>
          <div><small>Assigned to</small><strong>{order.assignedTo || 'Unassigned'}</strong></div>
          <div><small>Status</small><strong><span className={`status-readonly status-${slug(order.status)}`}>{order.status}</span></strong></div>
          <div><small>Due date</small><strong>{order.dueAt ? formatDate(order.dueAt) : '—'}</strong></div>
        </div>
        <div className="request-description"><small>Description</small><p>{order.description || 'No description provided.'}</p></div>
        <section className="request-attachments"><div className="section-kicker">EQUIPMENT PHOTOS <span className="count-badge">{images.length}</span></div>
          {images.length ? <div className="request-image-grid">{images.map((image, index) => <figure key={`${image.name}-${index}`}><img src={image.data} alt={`Attachment ${index + 1}: ${image.name}`} /><figcaption>{image.name}</figcaption></figure>)}</div> : <p className="no-attachments">No photos attached to this request.</p>}
        </section>
        <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Close</button></div>
      </section>
    </div>,
    document.body,
  );
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Unable to read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function PriorityBadge({ priority }) {
  return <span className={`priority-badge priority-${slug(priority)}`}><i />{priority}</span>;
}

function Assignee({ value }) {
  const name = value?.trim() || 'Unassigned';
  return <span className="assignee"><span className={`avatar ${name === 'Unassigned' ? 'avatar-empty' : ''}`}>{name === 'Unassigned' ? '?' : initials(name)}</span>{name}</span>;
}

function ConditionBadge({ value }) {
  const tone = value === 'Good' || value === 'Operational' ? 'condition-good' : 'condition-attention';
  return <span className={`condition-badge ${tone}`}><i />{value}</span>;
}

function initials(name) {
  return name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();
}

function slug(value) {
  return value.toLowerCase().replaceAll(' ', '-');
}

export default App;