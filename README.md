# Interview Repair Trainer

## 项目定位

Interview Repair Trainer 面向 Science and Engineering Undergraduates，用于搭建项目与科研经历深挖面试的临场修复训练体验。

## 技术栈

- Next.js（App Router 与 Route Handlers）
- React
- TypeScript
- Tailwind CSS
- Vitest
- Zod
- Docker

## 架构概览

项目按四层拆分：

- Persona：`protocols/personas/`，定义面试官表达风格。
- Core Interview Protocol：`protocols/core/`，定义可复用的面试行为规则。
- Scenario Pack：`protocols/scenarios/`，承载具体面试场景。
- Runtime Engine：`src/domain/`、`src/server/` 与 `src/services/`，承载状态机、checkpoint，以及后续 gate、repair 和 metrics 的运行边界。

`protocols/exports/` 预留给协议导出产物。当前代码已完成 Stage 1–6，包括 domain contracts、Gate Arbiter、首个协议场景、单一 Qwen adapter、服务端内存 Hidden Session，以及 text-first interview runtime 和最小 Training Console；尚未实现 Semantic Evaluator 编排、Hard Gate、STT 或 Repair runtime。

浏览器现可完成 Session 创建、开始回答、transcript 自动同步、版本化 checkpoint 和主动完成。下一阶段在同一个冻结 QuestionPlan 上进行 Semantic Evaluator/Gate Arbiter 编排。Browser STT、持久化和双模型优化均延后。

详细约束见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)，执行顺序见 [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md)。

## 本地启动

推荐使用与 Docker 一致的 Node.js 24；最低支持版本为 Node.js 20.9。

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`。健康检查地址为 `http://localhost:3000/api/healthz`。

如需实际调用 Qwen，将 `.env.example` 复制为被 Git 忽略的 `.env.local`，并填写 `QWEN_API_KEY`。默认模型为 `qwen3.8-flash`，同一非 thinking 配置用于问题规划和语义检查。测试和构建不需要真实 key。

```bash
npm test
npm run build
```
