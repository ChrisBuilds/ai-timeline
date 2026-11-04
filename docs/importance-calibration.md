# Initial v2 calibration — 2026-11-04

This is editorial calibration across the 37 events present on main at migration, not a statistically fitted model. The anchors and 35/30/25/10 weights are versioned together. Visibility requirements are tested separately from rankings.

## Pairwise checks

- The Transformer and AlexNet remain foundational technical landmarks (96 each).
- ChatGPT (90) outranks GPT-4 (80) because initial consumer access and subsequent everyday adoption outweigh a later model’s additional benchmark capability. The original 2022 model is not being described as more capable than GPT-4.
- Claude Code (78) remains Major and is an explicit overview milestone. Its developer audience does not have to equal ChatGPT's audience. It need not exceed every nearby model to remain represented.
- EU AI Act entry into force (77) is Major on institutional reach and governance contribution, with enforcement effects left for later review. It is not scored as a model breakthrough.
- Deep Blue (57) and AlphaGo (75) retain overview representation despite narrower direct adoption. Removing the maximum-rating bonus reduces scores without erasing historical milestones.
- LSTM rises from 63 to 87 based on architectural influence and relevant-audience uptake documented by later sequence modeling papers.
- Nobel recognition is assessed separately from the work recognized. The new bounds remain provisional because the award source could not be reopened; published legacy scores are retained until review.

These cases cover conceptual foundations, research, infrastructure, products, developer tools, institutions, science and public benchmark demonstrations. Tier boundaries remain 85/65/40: roughly 4.25/3.25/2 on the weighted 0–5 scale. Overview designation does not depend on passing a tier threshold.

## Sensitivity check

| Weights: influence / adoption / capability / society | ChatGPT | GPT-4 | Claude Code | EU AI Act |
| --- | ---: | ---: | ---: | ---: |
| Adopted: 35 / 30 / 25 / 10 | 90 | 80 | 78 | 77 |
| More societal reach: 30 / 30 / 25 / 15 | 90 | 80 | 77 | 78 |
| More downstream influence: 40 / 25 / 25 / 10 | 90 | 80 | 78 | 77 |

The selected comparisons remain stable under modest changes. Much greater capability weight (40%) would lower ChatGPT to 84 despite its documented broad adoption, which would overemphasize technical novelty for this timeline's scope. This is a reasoned starting calibration, not a claim that the weights uniquely measure history. Future calibration changes require a new version and a comparison report.

## Evidence and limits

The migration preserves original v1 inputs, overrides and reasons. It adds dated assessments, explicitly attributed editorial judgments, dimension evidence, comparison events, confidence, open questions and review triggers. No original assessment date is invented. Release-specific usage is distinguished from availability and later product-line adoption.

New retrospective evidence was opened for [ChatGPT usage](https://openai.com/index/how-people-are-using-chatgpt/) and [Claude Code adoption](https://www.anthropic.com/news/anthropic-acquires-bun-as-claude-code-reaches-usd1b-milestone). Vendor reports are attributed and marked medium confidence. Existing research papers, historical accounts, EU legislation announcement and the five new Claude announcements were consulted for their respective ratings. LSTM influence/adoption evidence references the 2014 sequence-to-sequence paper and 2017 Transformer paper already present among its sources.

Six assessments are provisional: Lighthill, backpropagation, the 1989 LeCun recognition paper, ImageNet, and both 2024 Nobel announcements. Their original sources were inaccessible or insufficient to freshly verify downstream influence in this pass. Their influence rating is unknown; valid original sources and published scores are preserved, with a review due 2026-12-04. This explicitly records unfinished evidence verification instead of presenting a converted legacy number as a newly substantiated score. Other ratings are editorial judgments with stated attribution limits and open questions, not claims of independent quantitative measurement.

## Migration comparison

Regenerate with `npm run importance:report`. “Published” retains an established score when a reassessment is provisional; bounds are not a point estimate.

| Event | v1 | Published | v2 rubric / bounds | Status | Overview |
| --- | ---: | ---: | ---: | --- | --- |
| Turing asks "Can machines think?" | 81 | 94 | 94 | accepted | Yes |
| The Dartmouth workshop names the field of artificial intelligence | 100 | 87 | 87 | accepted | Yes |
| Rosenblatt demonstrates the perceptron, a machine that learns | 66 | 66 | 66 | accepted |  |
| Weizenbaum publishes ELIZA, the first chatbot | 63 | 56 | 56 | accepted |  |
| The Lighthill report criticises AI research in Britain | 56 | 56 | 25–60 | provisional |  |
| Rumelhart, Hinton and Williams popularise backpropagation | 84 | 84 | 54–89 | provisional | Yes |
| LeCun and colleagues train a network to recognize ZIP-code digits | 41 | 41 | 40–75 | provisional |  |
| IBM's Deep Blue defeats world chess champion Garry Kasparov | 81 | 57 | 57 | accepted | Yes |
| Hochreiter and Schmidhuber publish their LSTM paper | 63 | 87 | 87 | accepted | Yes |
| Hinton, Osindero and Teh publish a deep-belief-net algorithm | 63 | 68 | 68 | accepted |  |
| Deng and colleagues introduce the ImageNet database | 66 | 66 | 54–89 | provisional | Yes |
| IBM Watson wins Jeopardy! | 63 | 55 | 55 | accepted |  |
| AlexNet wins ImageNet and starts the deep learning era | 94 | 96 | 96 | accepted | Yes |
| Ian Goodfellow and colleagues introduce generative adversarial networks | 69 | 76 | 76 | accepted |  |
| OpenAI announces its founding as a nonprofit | 56 | 62 | 62 | accepted |  |
| DeepMind's AlphaGo defeats Go champion Lee Sedol | 88 | 75 | 75 | accepted | Yes |
| "Attention Is All You Need" introduces the Transformer | 94 | 96 | 96 | accepted | Yes |
| Google researchers introduce BERT | 88 | 89 | 89 | accepted |  |
| OpenAI announces GPT-2 and stages its release | 66 | 62 | 62 | accepted |  |
| OpenAI researchers publish GPT-3 few-shot learning results | 88 | 85 | 85 | accepted | Yes |
| AlphaFold 2 results set a new CASP14 accuracy benchmark | 88 | 92 | 92 | accepted | Yes |
| Chain-of-thought prompting elicits reasoning in language models | 69 | 76 | 76 | accepted |  |
| Stable Diffusion weights are publicly released | 75 | 80 | 80 | accepted | Yes |
| OpenAI launches ChatGPT | 94 | 90 | 90 | accepted | Yes |
| Meta announces LLaMA and grants researchers access | 69 | 71 | 71 | accepted |  |
| Anthropic introduces Claude and Claude Instant | 47 | 65 | 65 | accepted |  |
| OpenAI releases GPT-4 | 97 | 80 | 80 | accepted |  |
| Anthropic expands Claude's context window to 100,000 tokens | 63 | 63 | 63 | accepted |  |
| Anthropic releases Claude 2 | 69 | 66 | 66 | accepted |  |
| Anthropic releases Claude 2.1 | 63 | 63 | 63 | accepted |  |
| Anthropic releases Claude 3 Opus and Sonnet | 72 | 78 | 78 | accepted |  |
| EU Artificial Intelligence Act enters into force | 63 | 77 | 77 | accepted | Yes |
| OpenAI releases o1, its first reasoning model | 91 | 72 | 72 | accepted |  |
| Nobel Prize in Physics recognizes neural-network foundations | 81 | 81 | 14–49 | provisional |  |
| Nobel Prize in Chemistry recognizes protein design and prediction | 88 | 88 | 14–49 | provisional |  |
| DeepSeek releases R1 as an open reasoning model | 91 | 74 | 74 | accepted |  |
| Anthropic releases Claude Code as a research preview | 72 | 78 | 78 | accepted | Yes |
