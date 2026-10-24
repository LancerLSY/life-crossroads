# AI-assisted development / AI辅助开发

Most of the implementation of Otherlife / 人生岔路 was written and revised with **Codex**, under the creator's direction. This includes the React/TypeScript interface, seeded life and relationship rules, Node server validation, pixel renderer, and regression tests. The creator supplied the gameplay requirements, requested revisions, chose the pixel direction and directed publication.

AI assistance is part of how the code was built. It is distinct from **DeepSeek**, the optional runtime service used for NPC dialogue, annual narration and fact-grounded relationship assessments. The publicly hosted browser preview runs local stories and does not call a shared model key.

Original pixel scenes and portraits are produced by the repository's rendering code. The birth-stage background was generated with Image Gen; [art provenance](assets.md) identifies it separately. Launch diagrams are labelled illustrated scenarios rather than UI screenshots or player testimonials.

The public [commit history](https://github.com/LancerLSY/life-crossroads/commits/main/), [architecture](architecture.md), [causal rules](causal-world.md) and tests make the implementation inspectable. The project has 207 passing tests plus lint, type checking and production builds at this release. Browser birth/play/save flows and real DeepSeek continuity/negative-appraisal scenarios have also been checked.

项目的大部分界面、引擎、服务端、像素绘制与测试实现由Codex按作者要求辅助生成和修改。作者负责提出玩法、反馈方向和发布决定。运行时可选的DeepSeek人物对话与年度分析，是与“使用AI辅助编写代码”分开的功能。

Repository: https://github.com/LancerLSY/life-crossroads

Playable preview: https://lancerlsy.github.io/life-crossroads/
