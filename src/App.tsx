import { useMemo, useState, type FormEvent } from 'react';

type TabKey = 'herb' | 'interaction' | 'remedy';

const tabs: { id: TabKey; label: string }[] = [
  { id: 'herb', label: 'إضافة عشبة' },
  { id: 'interaction', label: 'فحص التداخل' },
  { id: 'remedy', label: 'خطة علاجية' },
];

function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('herb');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  const [herbQuery, setHerbQuery] = useState('زنجبيل');
  const [herbName, setHerbName] = useState('زنجبيل');
  const [medications, setMedications] = useState('أسبرين، مضادات التجلط، محاليل سكر');
  const [condition, setCondition] = useState('ارتفاع ضغط الدم');
  const [symptoms, setSymptoms] = useState('ألم في المعدة وتشنجات خفيفة');
  const [userProfile, setUserProfile] = useState('عمر 42 عاماً، لا يوجد حمل، لا أمراض مزمنة');

  const endpoint = useMemo(() => {
    switch (activeTab) {
      case 'herb':
        return '/api/gemini/add-herb';
      case 'interaction':
        return '/api/gemini/check-interaction';
      case 'remedy':
        return '/api/gemini/remedy-advisor';
      default:
        return '/api/health';
    }
  }, [activeTab]);

  async function submitForm(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);

    const payload =
      activeTab === 'herb'
        ? { plantQuery: herbQuery }
        : activeTab === 'interaction'
          ? { herbName, medications, condition }
          : { symptoms, userProfile };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await response.json();
      if (!response.ok || json.success === false) {
        throw new Error(json.error || 'حدث خطأ أثناء الاتصال بالخادم');
      }

      setResult(json);
    } catch (err: any) {
      setError(err.message || 'حدث خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  }

  const renderDetails = () => {
    if (!result) {
      return null;
    }

    if (activeTab === 'herb') {
      const herb = result.herb ?? {};
      return (
        <div className="result-card">
          <h3>{herb.nameAr || 'العشبة'}</h3>
          <div className="meta-grid">
            <span><strong>الاسم الإنجليزي:</strong> {herb.nameEn || '—'}</span>
            <span><strong>الاسم العلمي:</strong> {herb.scientific || '—'}</span>
            <span><strong>الفصيلة:</strong> {herb.family || '—'}</span>
            <span><strong>النظام:</strong> {herb.system || '—'}</span>
            <span><strong>مستوى السلامة:</strong> {herb.safetyLevel || '—'}</span>
          </div>
          <div className="detail-stack">
            <p><strong>الهدف العلاجي:</strong> {herb.target || '—'}</p>
            <p><strong>المادة الفعالة:</strong> {herb.active || '—'}</p>
            <p><strong>الجرعة:</strong> {herb.dose || '—'}</p>
            <p><strong>طريقة التحضير:</strong> {herb.preparation || '—'}</p>
            <p><strong>السلامة:</strong> {herb.safety || '—'}</p>
            <p><strong>موانع الاستعمال:</strong> {herb.contraindications || '—'}</p>
            <p><strong>التداخلات:</strong> {herb.interactions || '—'}</p>
            <p><strong>معلومة تاريخية:</strong> {herb.historicalNote || '—'}</p>
            <p><strong>المراجع:</strong> {herb.references || '—'}</p>
          </div>
        </div>
      );
    }

    if (activeTab === 'interaction') {
      const analysis = result.analysis ?? {};
      return (
        <div className="result-card">
          <h3>تقرير التداخل</h3>
          <div className="meta-grid">
            <span><strong>مستوى الخطورة:</strong> {analysis.riskLevel || '—'}</span>
            <span><strong>اللون:</strong> {analysis.riskColor || '—'}</span>
            <span><strong>مدة الفصل:</strong> {analysis.spacingHours || '—'}</span>
          </div>
          <div className="detail-stack">
            <p><strong>الآلية:</strong> {analysis.mechanism || '—'}</p>
            <p><strong>التوصية السريرية:</strong> {analysis.clinicalAdvice || '—'}</p>
            <p><strong>ملخص:</strong> {analysis.summary || '—'}</p>
            <p><strong>المراجع:</strong> {analysis.references || '—'}</p>
          </div>
        </div>
      );
    }

    const protocol = result.protocol ?? {};
    return (
      <div className="result-card">
        <h3>{protocol.title || 'بروتوكول نباتي'}</h3>
        <div className="detail-stack">
          <p><strong>الأعشاب المقترحة:</strong></p>
          <ul>
            {(protocol.recommendedHerbs ?? []).map((item: any, idx: number) => (
              <li key={idx}>
                <strong>{item.herbName || 'عشبة'}</strong> — {item.role || 'دور علاجي'}<br />
                {item.doseAndUsage || 'جرعة غير متاحة'}
              </li>
            ))}
          </ul>
          <p><strong>طريقة التحضير:</strong> {protocol.preparationGuide || '—'}</p>
          <p><strong>الاحتياطات:</strong> {protocol.precautions || '—'}</p>
          <p><strong>نصيحة نمط الحياة:</strong> {protocol.lifestyleTip || '—'}</p>
          <p><strong>المراجع:</strong> {protocol.references || '—'}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">1000 عشبة</p>
          <h1>الصيدلية النباتية الذكية</h1>
        </div>
        <div className="status-pill">جُمعت لأجلك</div>
      </header>

      <nav className="tabbar" aria-label="التنقل بين الأدوات">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={tab.id === activeTab ? 'tab active' : 'tab'}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="content-grid">
        <section className="panel form-panel">
          <form onSubmit={submitForm}>
            {activeTab === 'herb' && (
              <>
                <label>
                  اسم النبتة أو الوصف
                  <textarea value={herbQuery} onChange={(e) => setHerbQuery(e.target.value)} rows={4} />
                </label>
              </>
            )}

            {activeTab === 'interaction' && (
              <>
                <label>
                  اسم العشبة
                  <input value={herbName} onChange={(e) => setHerbName(e.target.value)} />
                </label>
                <label>
                  الأدوية أو المواد
                  <textarea value={medications} onChange={(e) => setMedications(e.target.value)} rows={4} />
                </label>
                <label>
                  الحالة الصحية
                  <input value={condition} onChange={(e) => setCondition(e.target.value)} />
                </label>
              </>
            )}

            {activeTab === 'remedy' && (
              <>
                <label>
                  الأعراض أو الهدف الصحي
                  <textarea value={symptoms} onChange={(e) => setSymptoms(e.target.value)} rows={4} />
                </label>
                <label>
                  معلومات إضافية
                  <textarea value={userProfile} onChange={(e) => setUserProfile(e.target.value)} rows={4} />
                </label>
              </>
            )}

            <button className="primary-btn" type="submit" disabled={loading}>
              {loading ? 'جارٍ التحليل...' : 'توليد النتيجة'}
            </button>
          </form>
        </section>

        <section className="panel output-panel">
          {error && <div className="alert error">{error}</div>}
          {result ? renderDetails() : (<div className="empty-state">نتيجة التحليل ستظهر هنا.</div>)}
        </section>
      </main>
    </div>
  );
}

export default App;
