import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in server environment");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function parseJsonSafely(rawText: string | undefined): any {
  if (!rawText) return {};
  try {
    return JSON.parse(rawText);
  } catch {
    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    return JSON.parse(cleaned);
  }
}

const FALLBACK_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
  "gemini-flash-latest",
];

async function callGeminiWithResilience(
  ai: GoogleGenAI,
  params: {
    contents: string;
    config: any;
  }
) {
  let lastError: any = null;

  for (const model of FALLBACK_MODELS) {
    const maxRetries = 1;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[Gemini API] Requesting ${model} (attempt ${attempt + 1}/${maxRetries + 1})...`);
        const response = await ai.models.generateContent({
          model,
          contents: params.contents,
          config: params.config,
        });

        if (response && response.text) {
          return response;
        }
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || err || "").toLowerCase();
        const isTemporarySpike =
          msg.includes("503") ||
          msg.includes("unavailable") ||
          msg.includes("high demand") ||
          msg.includes("spikes in demand") ||
          msg.includes("429") ||
          msg.includes("resource_exhausted") ||
          msg.includes("overloaded") ||
          msg.includes("timeout") ||
          msg.includes("econnreset") ||
          msg.includes("fetch failed");

        console.warn(`[Gemini API] ${model} attempt ${attempt + 1} encountered: ${err?.message || err}`);

        if (isTemporarySpike) {
          if (attempt < maxRetries) {
            const delayMs = 400 + Math.floor(Math.random() * 300);
            console.log(`[Gemini API] Temporary spike detected. Quick retry in ${delayMs}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            continue;
          }
          console.warn(`[Gemini API] Switching immediately to next fallback candidate...`);
          break;
        }

        throw err;
      }
    }
  }

  throw lastError;
}

function handleGeminiError(error: any, res: express.Response, defaultArabicMessage: string) {
  console.error("Gemini Route Error:", error);
  const msg = String(error?.message || error || "").toLowerCase();
  const isHighDemand =
    msg.includes("503") ||
    msg.includes("high demand") ||
    msg.includes("unavailable") ||
    msg.includes("spikes in demand") ||
    msg.includes("429") ||
    msg.includes("resource_exhausted");

  const friendlyMessage = isHighDemand
    ? "خوادم الذكاء الاصطناعي تشهد إقبالاً وضغطاً مؤقتاً في هذه اللحظة. يرجى النقر على زر 'إعادة المحاولة' للمتابعة."
    : error?.message || defaultArabicMessage;

  res.status(isHighDemand ? 503 : 500).json({
    success: false,
    error: friendlyMessage,
    isTemporary: isHighDemand,
    canRetry: true,
  });
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.post("/api/gemini/add-herb", async (req, res) => {
  try {
    const { plantQuery } = req.body;
    if (!plantQuery || typeof plantQuery !== "string") {
      res.status(400).json({ error: "اسم النبتة أو الوصف مطلوب" });
      return;
    }

    const ai = getGenAI();
    const systemInstruction = `أنت خبير صيدلاني سريري وباحث في علم العقاقير والنباتات الطبية والتراث النباتي (Pharmacognosy & Phytotherapy) لدى صيدلية '1000 عشبة' (جُمعت لأجلك).
مهمتك: توليد بطاقة علمية شاملة ودقيقة لأي عشبة أو نبتة طبية يطلبها المستخدم، مستنداً حصرياً إلى مصادر موثقة عالمياً:
1. دراسات منظمة الصحة العالمية للنباتات الطبية (WHO Monographs on Selected Medicinal Plants Volumes 1-4)
2. دراسات الهيئة الأوروبية للأدوية (EMA/HMPC Community Herbal Monographs)
3. دستور اللجنة الألمانية للأعشاب الطبية (German Commission E Monographs)
4. دستور الأدوية الأمريكي للمكملات النباتية (United States Pharmacopeia - USP-NF)
5. التعاونية العلمية الأوروبية للعلاج بالنباتات (ESCOP Monographs)
6. بردية إيبرس المصرية الطبية وبرديات الطب المصري القديم (Ebers Papyrus c. 1550 BCE)
7. المكتبة الوطنية الأمريكية للطب وأبحاث (PubMed / NCBI & NIH-NCCIH).
الإخراج يجب أن يكون بتنسيق JSON متوافق مع المخطط المحدد بالكامل، مع معلومات سريرية دقيقة، جرعات قياسية، ومحاذير واضحة وسرد للمراجع المعتمدة.`;

    const prompt = `قم بإنشاء بطاقة سريرية وتوثيقية كاملة للعشبة أو النبتة الطبية: "${plantQuery}".
تأكد من استخراج وتوثيق الآتي من المراجع العالمية المعتمدة:
1. الاسم العربي الشائع والدقيق (nameAr).
2. الاسم الإنجليزي (nameEn).
3. الاسم العلمي باللاتينية (scientific).
4. الفصيلة النباتية (family).
5. الجهاز الحيوي المستهدف (system): اختر الفئة الأنسب من بين:
   - "المناعة"
   - "الهضم والكبد"
   - "الأعصاب والتكيف"
   - "التنفس والقلب"
   - "الهرمونات والصحة العامة"
   - "المفاصل والكلى"
   - "مغذية ووقائية"
   - "الجلد والتجميل"
6. التأثير والهدف العلاجي الرئيسي (target).
7. المادة الفعالة الرئيسية (active).
8. الجرعة القياسية وطريقة الاستعمال (dose).
9. طريقة التحضير الصيدلانية التقليدية (منقوع، مغلي، مسحوق، كبسولة، صبغة) (preparation).
10. درجة الأمان والمحاذير السريرية (safety).
11. موانع الاستعمال الصارمة (contraindications).
12. أهم التداخلات الدوائية المعروفة (interactions).
13. لمحة تاريخية أو أثرية موثقة (خاصة في التراث المصري القديم وبردية إيبرس أو الحضارات العريقة) (historicalNote).
14. وسم درجة الخطورة أو الحذر (safetyLevel): "آمن جداً" أو "حذر معتدل" أو "عالي الخطورة ويشترط إشراف طبي".
15. المراجع العلمية الدولية المحددة التي تدعم هذه النبتة (references): مثل (WHO Monographs, German Commission E, EMA/HMPC, USP, Ebers Papyrus).`;

    const response = await callGeminiWithResilience(ai, {
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            nameAr: { type: Type.STRING },
            nameEn: { type: Type.STRING },
            scientific: { type: Type.STRING },
            family: { type: Type.STRING },
            system: { type: Type.STRING },
            target: { type: Type.STRING },
            active: { type: Type.STRING },
            dose: { type: Type.STRING },
            preparation: { type: Type.STRING },
            safety: { type: Type.STRING },
            contraindications: { type: Type.STRING },
            interactions: { type: Type.STRING },
            historicalNote: { type: Type.STRING },
            safetyLevel: { type: Type.STRING },
            references: { type: Type.STRING, description: "المراجع والدساتير العالمية المعتمدة المستند إليها" },
          },
          required: [
            "nameAr",
            "nameEn",
            "scientific",
            "system",
            "target",
            "active",
            "dose",
            "safety",
          ],
        },
      },
    });

    const parsedData = parseJsonSafely(response.text);
    res.json({ success: true, herb: parsedData });
  } catch (error: any) {
    handleGeminiError(error, res, "حدث خطأ أثناء استخراج بيانات النبتة بالذكاء الاصطناعي");
  }
});

app.post("/api/gemini/check-interaction", async (req, res) => {
  try {
    const { herbName, medications, condition } = req.body;
    if (!herbName || !medications) {
      res.status(400).json({ error: "اسم العشبة وقائمة الأدوية مطلوبة للفحص" });
      return;
    }

    const ai = getGenAI();
    const prompt = `بصفتك صيدلياً سريرياً خبيراً، قم بفحص التداخل الدوائي بين العشبة: "${herbName}"
والأدوية أو المواد التالية: "${medications}"
الحالة الصحية للمريض (إن وجدت): "${condition || "غير محدد"}"

استحضر معلوماتك حصرياً من أهم المراجع الصيدلانية السريرية المعتمدة عالمياً:
- مرجع ستوكلي للتداخلات الدوائية والعشبية (Stockley's Herbal Medicines Interactions)
- تقارير الهيئة الأوروبية للأدوية ولجنة المنتجات العشبية (EMA / HMPC)
- أبحاث المكتبة الوطنية الأمريكية للطب وتجارب المعاهد الوطنية للصحة (PubMed / NCBI & NIH-NCCIH).

قم بتقديم تقرير فحص تفصيلي يتضمن:
1. مستوى الخطورة الإجمالي (riskLevel: "آمن - منخفض الخطورة" | "تداخل معتدل - يلزم المراقبة أو المباعدة" | "خطر شديد - تعارض ممنوع تماماً").
2. الآلية الحيوية للتداخل (cytochrome P450, امتصاص، سيولة الدم، ضغط، سكر).
3. التوصية السريرية للمريض وطريقة الاستخدام الآمنة أو البديل.
4. مدة الفصل الزمني الموصى بها بين الجرعات.
5. المراجع السريرية العالمية المحددة التي تؤكد هذا التداخل (references).`;

    const response = await callGeminiWithResilience(ai, {
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            riskLevel: { type: Type.STRING },
            riskColor: { type: Type.STRING, description: "green, yellow, red" },
            mechanism: { type: Type.STRING },
            clinicalAdvice: { type: Type.STRING },
            spacingHours: { type: Type.STRING },
            summary: { type: Type.STRING },
            references: { type: Type.STRING, description: "المراجع السريرية المعتمدة (Stockley's, EMA, PubMed)" },
          },
          required: ["riskLevel", "mechanism", "clinicalAdvice", "summary"],
        },
      },
    });

    const analysis = parseJsonSafely(response.text);
    res.json({ success: true, analysis });
  } catch (error: any) {
    handleGeminiError(error, res, "حدث خطأ أثناء فحص التداخل الدوائي");
  }
});

app.post("/api/gemini/remedy-advisor", async (req, res) => {
  try {
    const { symptoms, userProfile } = req.body;
    if (!symptoms) {
      res.status(400).json({ error: "الأعراض أو الهدف الصحي مطلوب" });
      return;
    }

    const ai = getGenAI();
    const prompt = `استناداً إلى موسوعة "1000 عشبة" (جُمعت لأجلك) ودساتير الأعشاب الطبية العالمية المعتمدة (WHO Monographs, German Commission E, ESCOP, EMA/HMPC, وبردية إيبرس المصرية القديمة):
ما هي أفضل الوصفات والأعشاب الطبيعية الموصى بها للحالة التالية:
الأعراض أو الهدف: "${symptoms}"
معلومات إضافية (عمر، أمراض مزمنة، حمل/إرضاع): "${userProfile || "لا يوجد"}"

قدم بروتوكولاً عشبياً مقترحاً موثقاً يشمل:
1. أسماء 2 إلى 3 أعشاب رئيسية مناسبة مع ذكر أسمائها العلمية ودورها العلاجي.
2. طريقة التحضير الصيدلانية الدقيقة والجرعة اليومية الآمنة.
3. التحذيرات وموانع الاستعمال الدقيقة.
4. نصائح نمط الحياة المصاحبة.
5. المراجع العلمية الدولية المعتمدة التي تؤيد هذا البروتوكول (references).`;

    const response = await callGeminiWithResilience(ai, {
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            recommendedHerbs: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  herbName: { type: Type.STRING },
                  role: { type: Type.STRING },
                  doseAndUsage: { type: Type.STRING },
                },
                required: ["herbName", "role", "doseAndUsage"],
              },
            },
            preparationGuide: { type: Type.STRING },
            precautions: { type: Type.STRING },
            lifestyleTip: { type: Type.STRING },
            references: { type: Type.STRING, description: "المراجع والدساتير الدولية المعتمدة" },
          },
          required: ["title", "recommendedHerbs", "preparationGuide", "precautions"],
        },
      },
    });

    const advisorResult = parseJsonSafely(response.text);
    res.json({ success: true, protocol: advisorResult });
  } catch (error: any) {
    handleGeminiError(error, res, "حدث خطأ أثناء إعداد البروتوكول النباتي");
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[1000 Herbs Server] running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
