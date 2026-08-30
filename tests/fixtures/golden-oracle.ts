import type { QuestionPlan } from "../../src/domain/interview/contracts";
import type { GateIssueType } from "../../src/domain/semantic/contracts";

export const GOLDEN_ORACLE_VERSION = "1.0" as const;
export const GOLDEN_ORACLE_SHA256 =
  "A1678254FF31F2BF05D85D99EBBD7C101C28E23324B795CEFCD7065B983972FC" as const;

export const GOLDEN_QUESTION_PLAN_IDS = [
  "QP1",
  "QP2",
  "QP3",
  "QP4",
  "QP5",
  "QP6",
] as const;

export type GoldenQuestionPlanId =
  (typeof GOLDEN_QUESTION_PLAN_IDS)[number];

export type GoldenQuestionPlanFixture = Readonly<{
  oracleId: GoldenQuestionPlanId;
  family: string;
  oracleSurfaceQuestion: string;
  plan: QuestionPlan;
  requiredEvidenceSurfaceCues: Readonly<
    Record<string, readonly string[]>
  >;
}>;

export const GOLDEN_QUESTION_PLANS = {
  QP1: {
    oracleId: "QP1",
    family: "Problem & Motivation",
    oracleSurfaceQuestion: "你要解决什么问题？为什么重要？",
    plan: {
      id: "problem-and-motivation",
      surfaceQuestion: "你当时具体想解决什么问题？这个问题在项目中为什么重要？",
      primaryTarget: {
        id: "problem-framing",
        description: "Explain the concrete problem, motivation, and scope.",
      },
      requiredEvidence: [
        {
          id: "problem-context",
          description: "A concrete description of the problem or research question.",
        },
        {
          id: "motivation-or-stakes",
          description: "Why the problem mattered within the stated project scope.",
        },
      ],
      optionalEvidence: [
        {
          id: "technical-detail",
          description: "A concrete technical detail that clarifies the work.",
        },
      ],
      allowedGateIssueTypes: [
        "NOT_ANSWERING_QUESTION",
        "VAGUE_WITHOUT_EVIDENCE",
      ],
    },
    requiredEvidenceSurfaceCues: {
      "problem-context": ["具体想解决什么问题"],
      "motivation-or-stakes": ["为什么重要"],
    },
  },
  QP2: {
    oracleId: "QP2",
    family: "Personal Contribution",
    oracleSurfaceQuestion: "你本人具体做了什么？",
    plan: {
      id: "personal-contribution",
      surfaceQuestion: "在这个项目中，哪些设计、实现、分析或决策是由你本人完成的？",
      primaryTarget: {
        id: "personal-ownership",
        description: "Separate the candidate's own contribution from team activity.",
      },
      requiredEvidence: [
        {
          id: "personal-action",
          description:
            "A specific action, decision, implementation, or analysis performed by the candidate.",
        },
      ],
      optionalEvidence: [
        {
          id: "team-context",
          description: "Context about collaborators or team responsibilities.",
        },
        {
          id: "technical-detail",
          description: "A concrete technical detail that clarifies the work.",
        },
      ],
      allowedGateIssueTypes: [
        "NOT_ANSWERING_QUESTION",
        "OWNERSHIP_AMBIGUOUS",
      ],
    },
    requiredEvidenceSurfaceCues: {
      "personal-action": ["由你本人完成"],
    },
  },
  QP3: {
    oracleId: "QP3",
    family: "Technical Choice",
    oracleSurfaceQuestion: "你选择了什么方案？为什么？",
    plan: {
      id: "technical-choice",
      surfaceQuestion: "你选择了哪项重要的技术方案？为什么这样选择？",
      primaryTarget: {
        id: "technical-reasoning",
        description: "Explain a technical choice and the reasoning behind it.",
      },
      requiredEvidence: [
        {
          id: "decision-rationale",
          description: "Reasoning or tradeoffs behind a technical choice.",
        },
      ],
      optionalEvidence: [
        {
          id: "technical-detail",
          description: "A concrete technical detail that clarifies the work.",
        },
      ],
      allowedGateIssueTypes: [
        "NOT_ANSWERING_QUESTION",
        "VAGUE_WITHOUT_EVIDENCE",
      ],
    },
    requiredEvidenceSurfaceCues: {
      "decision-rationale": ["为什么这样选择"],
    },
  },
  QP4: {
    oracleId: "QP4",
    family: "Results & Validation",
    oracleSurfaceQuestion: "得到了什么结果？如何验证？",
    plan: {
      id: "results-and-validation",
      surfaceQuestion: "你实际观察到了什么结果？你是如何验证这个结果的？",
      primaryTarget: {
        id: "evidence-based-result",
        description: "Describe an observed result and how it was validated.",
      },
      requiredEvidence: [
        {
          id: "observed-result",
          description:
            "A result that was actually observed, or a clear statement that no reliable result was measured.",
        },
        {
          id: "validation-method",
          description:
            "How an observation was checked, or a clear statement that it was not reliably validated.",
        },
      ],
      optionalEvidence: [
        {
          id: "technical-detail",
          description: "A concrete technical detail that clarifies the work.",
        },
      ],
      allowedGateIssueTypes: [
        "NOT_ANSWERING_QUESTION",
        "VAGUE_WITHOUT_EVIDENCE",
      ],
    },
    requiredEvidenceSurfaceCues: {
      "observed-result": ["观察到了什么结果"],
      "validation-method": ["如何验证这个结果"],
    },
  },
  QP5: {
    oracleId: "QP5",
    family: "Challenge & Iteration",
    oracleSurfaceQuestion: "遇到什么问题？改了什么？结果如何？",
    plan: {
      id: "challenge-and-iteration",
      surfaceQuestion:
        "请描述项目中遇到的一个重要问题、你为此做出的调整，以及调整后的结果。",
      primaryTarget: {
        id: "iteration-and-recovery",
        description: "Explain how the candidate responded to a problem or failed attempt.",
      },
      requiredEvidence: [
        {
          id: "iteration-evidence",
          description:
            "The problem encountered, response taken, and resulting change.",
        },
      ],
      optionalEvidence: [
        {
          id: "technical-detail",
          description: "A concrete technical detail that clarifies the work.",
        },
        {
          id: "team-context",
          description: "Context about collaborators or team responsibilities.",
        },
      ],
      allowedGateIssueTypes: [
        "NOT_ANSWERING_QUESTION",
        "VAGUE_WITHOUT_EVIDENCE",
      ],
    },
    requiredEvidenceSurfaceCues: {
      "iteration-evidence": ["遇到", "做出的调整", "调整后的结果"],
    },
  },
  QP6: {
    oracleId: "QP6",
    family: "Limitations",
    oracleSurfaceQuestion: "你的工作不能说明什么？还有什么不确定性？",
    plan: {
      id: "limitations-and-boundaries",
      surfaceQuestion: "这项工作尚不能证明什么？还存在哪些不确定性？",
      primaryTarget: {
        id: "boundary-awareness",
        description: "State what the work could not establish and why.",
      },
      requiredEvidence: [
        {
          id: "limitation",
          description: "A specific limitation, uncertainty, or unsupported conclusion.",
        },
      ],
      optionalEvidence: [
        {
          id: "validation-method",
          description:
            "How an observation was checked, or a clear statement that it was not reliably validated.",
        },
      ],
      allowedGateIssueTypes: ["NOT_ANSWERING_QUESTION"],
    },
    requiredEvidenceSurfaceCues: {
      limitation: ["尚不能证明什么", "不确定性"],
    },
  },
} as const satisfies Readonly<
  Record<GoldenQuestionPlanId, GoldenQuestionPlanFixture>
>;

export const GOLDEN_CORE_CASE_IDS = [
  "G01",
  "G02",
  "G03",
  "G04",
  "G05",
  "G06",
  "G07",
  "G08",
  "G09",
  "G10",
  "G11",
  "G12",
  "G13",
  "G14",
  "G15",
  "G16",
  "G17",
  "G18",
  "G19",
  "G20",
] as const;

export type GoldenCoreCaseId = (typeof GOLDEN_CORE_CASE_IDS)[number];

type GoldenSemanticExpectation =
  | Readonly<{ decision: "CONTINUE"; issueType: null }>
  | Readonly<{
      decision: "ISSUE_DETECTED";
      issueType: GateIssueType;
    }>;

export type GoldenCoreCase = Readonly<{
  id: GoldenCoreCaseId;
  title: string;
  questionPlanId: GoldenQuestionPlanId;
  oracleQuestionOverride?: string;
  transcriptKind: "ANSWER" | "CHECKPOINT";
  transcript: string;
  expectedSemantic: GoldenSemanticExpectation;
  expectedGate: "CONTINUE" | "GATE";
}>;

export const GOLDEN_CORE_CASES = [
  {
    id: "G01",
    title: "明确正确",
    questionPlanId: "QP3",
    oracleQuestionOverride: "你选择了什么技术方案？为什么？",
    transcriptKind: "ANSWER",
    transcript:
      "我负责端侧模型选型，最后选择 YOLOv8n。因为 K230 的内存和延迟预算比较紧，我们比较了 v8n 和 v8s，v8s 精度略高但端侧运行明显更慢，所以最终优先保证实时运行。",
    expectedSemantic: { decision: "CONTINUE", issueType: null },
    expectedGate: "CONTINUE",
  },
  {
    id: "G02",
    title: "只回答 What，没有 Why",
    questionPlanId: "QP3",
    transcriptKind: "ANSWER",
    transcript: "我最后选择了 YOLOv8n，并进行了 INT8 量化和部署。",
    expectedSemantic: {
      decision: "ISSUE_DETECTED",
      issueType: "NOT_ANSWERING_QUESTION",
    },
    expectedGate: "GATE",
  },
  {
    id: "G03",
    title: "没有数字，但理由充分",
    questionPlanId: "QP3",
    transcriptKind: "ANSWER",
    transcript:
      "我选择 FastAPI，因为整个评估逻辑已经是 Python，挑战只有 16 小时，引入第二套后端技术栈只会增加集成风险，所以这里优先开发速度而不是框架性能。",
    expectedSemantic: { decision: "CONTINUE", issueType: null },
    expectedGate: "CONTINUE",
  },
  {
    id: "G04",
    title: "名义上回答 Why，但完全空泛",
    questionPlanId: "QP3",
    transcriptKind: "ANSWER",
    transcript: "我选择 FastAPI，因为它性能比较好，也比较先进，而且很适合这个项目。",
    expectedSemantic: {
      decision: "ISSUE_DETECTED",
      issueType: "VAGUE_WITHOUT_EVIDENCE",
    },
    expectedGate: "GATE",
  },
  {
    id: "G05",
    title: "先“我们”，后明确“我”",
    questionPlanId: "QP2",
    transcriptKind: "ANSWER",
    transcript:
      "这个项目是四个人一起做的。我们共同确定了总体方案，但我个人负责模型选型、INT8 量化和端侧推理接口；数据采集和硬件部分是另外两位同学完成的。",
    expectedSemantic: { decision: "CONTINUE", issueType: null },
    expectedGate: "CONTINUE",
  },
  {
    id: "G06",
    title: "全程只有团队活动",
    questionPlanId: "QP2",
    transcriptKind: "ANSWER",
    transcript:
      "我们一起负责模型、部署和测试，基本每个人都有参与，最后也是大家一起完成的。",
    expectedSemantic: {
      decision: "ISSUE_DETECTED",
      issueType: "OWNERSHIP_AMBIGUOUS",
    },
    expectedGate: "GATE",
  },
  {
    id: "G07",
    title: "很粗糙，但 ownership 已经明确",
    questionPlanId: "QP2",
    transcriptKind: "ANSWER",
    transcript: "我主要负责后端。",
    expectedSemantic: { decision: "CONTINUE", issueType: null },
    expectedGate: "CONTINUE",
  },
  {
    id: "G08",
    title: "职位不等于个人行动",
    questionPlanId: "QP2",
    transcriptKind: "ANSWER",
    transcript: "我是项目负责人，整体上的事情基本都是我负责。",
    expectedSemantic: {
      decision: "ISSUE_DETECTED",
      issueType: "OWNERSHIP_AMBIGUOUS",
    },
    expectedGate: "GATE",
  },
  {
    id: "G09",
    title: "无量化数据，但诚实说明测量边界",
    questionPlanId: "QP4",
    transcriptKind: "ANSWER",
    transcript:
      "我们没有得到可靠的量化提升。只跑了 3 次室内测试，而且两套设备的时间戳不一致，所以我不能声称延迟降低了多少。我们能确认的只有三次流程都能完整运行，没有出现同步崩溃。",
    expectedSemantic: { decision: "CONTINUE", issueType: null },
    expectedGate: "CONTINUE",
  },
  {
    id: "G10",
    title: "模糊指标",
    questionPlanId: "QP4",
    transcriptKind: "ANSWER",
    transcript:
      "效果提升得挺明显的，准确率大概高了不少，延迟也低了很多，我们测过几次。",
    expectedSemantic: {
      decision: "ISSUE_DETECTED",
      issueType: "VAGUE_WITHOUT_EVIDENCE",
    },
    expectedGate: "GATE",
  },
  {
    id: "G11",
    title: "结果与验证均明确",
    questionPlanId: "QP4",
    transcriptKind: "ANSWER",
    transcript:
      "在固定的 200 张 held-out 图片上，mAP50 是 0.84；我们用固定脚本跑同一个 checkpoint。延迟是在同一台 K230 上连续推理 100 次后取中位数，大约 42ms。",
    expectedSemantic: { decision: "CONTINUE", issueType: null },
    expectedGate: "CONTINUE",
  },
  {
    id: "G12",
    title: "有数字，但没回答如何验证",
    questionPlanId: "QP4",
    transcriptKind: "ANSWER",
    transcript: "最后 mAP50 是 0.84，延迟大约 42ms。",
    expectedSemantic: {
      decision: "ISSUE_DETECTED",
      issueType: "NOT_ANSWERING_QUESTION",
    },
    expectedGate: "GATE",
  },
  {
    id: "G13",
    title: "有短暂背景，但最终明确回答 Why",
    questionPlanId: "QP3",
    transcriptKind: "ANSWER",
    transcript:
      "最开始我们只用了 dense retrieval，但测试时发现一些政策名称必须精确匹配。分析了大约二十个失败例子以后，我改成 BM25 加 embedding 的混合检索，因为它既保留语义召回，又能找回这些精确术语。",
    expectedSemantic: { decision: "CONTINUE", issueType: null },
    expectedGate: "CONTINUE",
  },
  {
    id: "G14",
    title: "说了很多 What，但始终没有 Why",
    questionPlanId: "QP3",
    transcriptKind: "ANSWER",
    transcript:
      "最开始用了 dense retrieval，后来又试了 BM25，还改过 chunk size，之后写了前端和评测脚本，最后我们用了混合检索。",
    expectedSemantic: {
      decision: "ISSUE_DETECTED",
      issueType: "NOT_ANSWERING_QUESTION",
    },
    expectedGate: "GATE",
  },
  {
    id: "G15",
    title: "Problem → Action → Result 完整",
    questionPlanId: "QP5",
    transcriptKind: "ANSWER",
    transcript:
      "最大的问题是传感器时间戳会漂移，融合结果偶尔跳变。我把同步逻辑改成 monotonic clock，同时增加日志检测；改完后三次测试没有再出现那个跳变，不过样本太少，我不能说问题已经彻底解决。",
    expectedSemantic: { decision: "CONTINUE", issueType: null },
    expectedGate: "CONTINUE",
  },
  {
    id: "G16",
    title: "每个部分都有名词，但都很空泛",
    questionPlanId: "QP5",
    transcriptKind: "ANSWER",
    transcript: "中间遇到了一些同步问题，后来我们优化了一下，最终效果就变好了。",
    expectedSemantic: {
      decision: "ISSUE_DETECTED",
      issueType: "VAGUE_WITHOUT_EVIDENCE",
    },
    expectedGate: "GATE",
  },
  {
    id: "G17",
    title: "明确 limitation",
    questionPlanId: "QP6",
    transcriptKind: "ANSWER",
    transcript:
      "我们只能说明目前三次室内测试可以运行，不能证明户外复杂光照下仍然稳定，因为测试环境和数据覆盖都不够。",
    expectedSemantic: { decision: "CONTINUE", issueType: null },
    expectedGate: "CONTINUE",
  },
  {
    id: "G18",
    title: "问 limitation，却回答 implementation",
    questionPlanId: "QP6",
    transcriptKind: "ANSWER",
    transcript: "我们用了 IMU、摄像头和 EKF，然后对系统进行了融合。",
    expectedSemantic: {
      decision: "ISSUE_DETECTED",
      issueType: "NOT_ANSWERING_QUESTION",
    },
    expectedGate: "GATE",
  },
  {
    id: "G19",
    title: "用户显然还没说完",
    questionPlanId: "QP3",
    transcriptKind: "CHECKPOINT",
    transcript: "我最后选择混合检索，主要是因为……",
    expectedSemantic: { decision: "CONTINUE", issueType: null },
    expectedGate: "CONTINUE",
  },
  {
    id: "G20",
    title: "已经完整结束，但仍没有 Why",
    questionPlanId: "QP3",
    transcriptKind: "ANSWER",
    transcript:
      "我最后选择混合检索。我们还调了 chunk size，做了前端，写了评测，也改了 prompt，最后方案就是混合检索。",
    expectedSemantic: {
      decision: "ISSUE_DETECTED",
      issueType: "NOT_ANSWERING_QUESTION",
    },
    expectedGate: "GATE",
  },
] as const satisfies readonly GoldenCoreCase[];

export const GOLDEN_RELEASE_GROUPS = {
  P0_FALSE_GATE_SAFETY: ["G05", "G07", "G09", "G13", "G17", "G19"],
  P1_CLEAR_GATE_RECALL: [
    "G02",
    "G04",
    "G06",
    "G08",
    "G10",
    "G12",
    "G14",
    "G16",
    "G18",
    "G20",
  ],
} as const satisfies Readonly<
  Record<"P0_FALSE_GATE_SAFETY" | "P1_CLEAR_GATE_RECALL", readonly GoldenCoreCaseId[]>
>;

export const GOLDEN_REPAIR_CASE_IDS = [
  "R01",
  "R02",
  "R03",
  "R04",
  "R05",
  "R06",
] as const;

export type GoldenRepairCaseId = (typeof GOLDEN_REPAIR_CASE_IDS)[number];

export type GoldenRepairCase = Readonly<{
  id: GoldenRepairCaseId;
  title: string;
  questionPlanId: GoldenQuestionPlanId;
  question: string | null;
  firstAnswer: string | null;
  expectedInitialIssue: GateIssueType;
  repairAnswer: string;
  expectedOutcome: "Repair Successful" | "Unresolved";
  pendingStage: "Stage 9";
  sourceCompleteness: "COMPLETE" | "REPAIR_ONLY";
  inferredFields: readonly ("questionPlanId" | "expectedInitialIssue")[];
}>;

export const GOLDEN_REPAIR_CASES = [
  {
    id: "R01",
    title: "NOT → Repair Successful",
    questionPlanId: "QP3",
    question: "为什么选 YOLOv8n？",
    firstAnswer: "我们用了 YOLOv8n，并做了 INT8 量化。",
    expectedInitialIssue: "NOT_ANSWERING_QUESTION",
    repairAnswer:
      "我最终选择 YOLOv8n，主要因为 K230 的算力和内存限制。v8s 精度略好，但端侧延迟明显更高，所以我优先满足实时性要求。",
    expectedOutcome: "Repair Successful",
    pendingStage: "Stage 9",
    sourceCompleteness: "COMPLETE",
    inferredFields: [],
  },
  {
    id: "R02",
    title: "OWNERSHIP → Repair Successful",
    questionPlanId: "QP2",
    question: "你本人具体做了什么？",
    firstAnswer: "我们一起做了模型、部署和测试。",
    expectedInitialIssue: "OWNERSHIP_AMBIGUOUS",
    repairAnswer:
      "团队共同定方案；我个人负责 INT8 量化、模型转换和推理接口，数据标注和硬件不是我做的。",
    expectedOutcome: "Repair Successful",
    pendingStage: "Stage 9",
    sourceCompleteness: "COMPLETE",
    inferredFields: [],
  },
  {
    id: "R03",
    title: "VAGUE → 诚实边界也可以 Repair 成功",
    questionPlanId: "QP4",
    question: "得到了什么结果？如何验证？",
    firstAnswer: "效果提升很多，整体挺稳定的。",
    expectedInitialIssue: "VAGUE_WITHOUT_EVIDENCE",
    repairAnswer:
      "我刚才说“提高很多”不准确。我们没有做受控 benchmark，所以没有可靠的提升比例。我们只确认三次端到端测试能完整运行，因此我不能声称性能有量化提升。",
    expectedOutcome: "Repair Successful",
    pendingStage: "Stage 9",
    sourceCompleteness: "COMPLETE",
    inferredFields: [],
  },
  {
    id: "R04",
    title: "NOT → Repair 仍空泛",
    questionPlanId: "QP3",
    question: null,
    firstAnswer: null,
    expectedInitialIssue: "NOT_ANSWERING_QUESTION",
    repairAnswer: "因为它比较适合边缘端。",
    expectedOutcome: "Unresolved",
    pendingStage: "Stage 9",
    sourceCompleteness: "REPAIR_ONLY",
    inferredFields: ["questionPlanId", "expectedInitialIssue"],
  },
  {
    id: "R05",
    title: "OWNERSHIP → 仍然只有身份",
    questionPlanId: "QP2",
    question: null,
    firstAnswer: null,
    expectedInitialIssue: "OWNERSHIP_AMBIGUOUS",
    repairAnswer: "我是负责人，所以很多部分我其实都有参与。",
    expectedOutcome: "Unresolved",
    pendingStage: "Stage 9",
    sourceCompleteness: "REPAIR_ONLY",
    inferredFields: ["questionPlanId", "expectedInitialIssue"],
  },
  {
    id: "R06",
    title: "Evidence → 仍然没有验证依据",
    questionPlanId: "QP4",
    question: null,
    firstAnswer: null,
    expectedInitialIssue: "VAGUE_WITHOUT_EVIDENCE",
    repairAnswer: "验证的话就是我们测过，结果还是比较稳定的。",
    expectedOutcome: "Unresolved",
    pendingStage: "Stage 9",
    sourceCompleteness: "REPAIR_ONLY",
    inferredFields: ["questionPlanId", "expectedInitialIssue"],
  },
] as const satisfies readonly GoldenRepairCase[];

export const GOLDEN_SYSTEM_CASE_IDS = [
  "S01",
  "S02",
  "S03",
  "S04",
  "S05",
  "S06",
] as const;

export type GoldenSystemCaseId = (typeof GOLDEN_SYSTEM_CASE_IDS)[number];

export type GoldenSystemCase = Readonly<{
  id: GoldenSystemCaseId;
  condition: string;
  oracleExpectation: string;
  expectedDisposition:
    | "CONTINUE"
    | "DISCARD_STALE_RESULT"
    | "NO_SECOND_HARD_GATE"
    | "PRESERVE_FROZEN_QUESTION_PLAN";
  pendingStage: "Stage 9" | null;
}>;

export const GOLDEN_SYSTEM_CASES = [
  {
    id: "S01",
    condition: "Semantic Evaluator timeout",
    oracleExpectation: "CONTINUE，绝不 Gate",
    expectedDisposition: "CONTINUE",
    pendingStage: null,
  },
  {
    id: "S02",
    condition: "Qwen JSON 无效，retry 后仍无效",
    oracleExpectation: "CONTINUE",
    expectedDisposition: "CONTINUE",
    pendingStage: null,
  },
  {
    id: "S03",
    condition: "用户修改 transcript 后，旧 checkpoint 结果才返回",
    oracleExpectation: "丢弃旧结果，不 Gate",
    expectedDisposition: "DISCARD_STALE_RESULT",
    pendingStage: null,
  },
  {
    id: "S04",
    condition: "已进入 Repair / Reanswer / Question Done 后旧结果返回",
    oracleExpectation: "丢弃旧结果",
    expectedDisposition: "DISCARD_STALE_RESULT",
    pendingStage: null,
  },
  {
    id: "S05",
    condition: "本题已经 Hard Gate 过一次",
    oracleExpectation: "不允许第二次 Hard Gate",
    expectedDisposition: "NO_SECOND_HARD_GATE",
    pendingStage: null,
  },
  {
    id: "S06",
    condition: "Repair 阶段模型试图改变 primaryTarget / requiredEvidence",
    oracleExpectation: "产品验收失败；必须继续使用原 frozen QuestionPlan",
    expectedDisposition: "PRESERVE_FROZEN_QUESTION_PLAN",
    pendingStage: "Stage 9",
  },
] as const satisfies readonly GoldenSystemCase[];

export const GOLDEN_PLANNER_INVARIANTS = [
  {
    id: "PI1",
    statement: "只有一个 primaryTarget",
  },
  {
    id: "PI2",
    statement: "requiredEvidence 必须确实被 surfaceQuestion 显式要求",
  },
  {
    id: "PI3",
    statement: "optionalEvidence 缺失不能触发 Hard Gate",
  },
  {
    id: "PI4",
    statement: "回答开始后 QuestionPlan 永远冻结，包括 Repair 阶段",
  },
] as const satisfies readonly Readonly<{
  id: "PI1" | "PI2" | "PI3" | "PI4";
  statement: string;
}>[];

/** Stable live-runner boundary keyed by the canonical scenario family id. */
export const goldenQuestionPlans = {
  "problem-and-motivation": GOLDEN_QUESTION_PLANS.QP1.plan,
  "personal-contribution": GOLDEN_QUESTION_PLANS.QP2.plan,
  "technical-choice": GOLDEN_QUESTION_PLANS.QP3.plan,
  "results-and-validation": GOLDEN_QUESTION_PLANS.QP4.plan,
  "challenge-and-iteration": GOLDEN_QUESTION_PLANS.QP5.plan,
  "limitations-and-boundaries": GOLDEN_QUESTION_PLANS.QP6.plan,
} as const satisfies Readonly<Record<string, QuestionPlan>>;

export const goldenSemanticCases = GOLDEN_CORE_CASES;
export const p0FalseGateCaseIds = GOLDEN_RELEASE_GROUPS.P0_FALSE_GATE_SAFETY;
export const p1ClearGateCaseIds = GOLDEN_RELEASE_GROUPS.P1_CLEAR_GATE_RECALL;
export const goldenRepairCases = GOLDEN_REPAIR_CASES;
export const goldenSystemCases = GOLDEN_SYSTEM_CASES;
export const plannerGoldenInvariants = GOLDEN_PLANNER_INVARIANTS;
