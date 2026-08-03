import type { AssessmentRecordStatus, QuestionDifficulty } from '../features/assessment/types';

export const zhCN = {
  tabs: { assess: '测评', history: '历史', settings: '设置' },
  assess: {
    title: '智能技能测评',
    notice: '测评主题和生成提示将直接发送到你配置的模型服务，本应用不经过后端服务器。',
    section: '测评设置',
    provider: '模型服务',
    configureProvider: '生成测评前，请先完成一次模型配置。',
    configured: (model: string) => `已配置：${model}`,
    topic: '测评主题',
    topicPlaceholder: '例如：后端架构能力',
    notes: '补充说明',
    notesPlaceholder: '可选：补充重点考察方向',
    settings: '设置',
    generating: '生成中…',
    generate: '生成测评',
  },
  history: {
    kicker: '历史',
    title: '测评记录',
    notice: '查看过往答题记录、作答选择、正确答案和题目解析。',
    section: '历史测评',
    empty: '还没有保存的测评记录。',
    draft: '草稿',
  },
  settings: {
    kicker: '设置',
    title: '模型配置',
    notice:
      '只需配置一次 OpenAI 兼容接口。原生应用会在可用时通过 Expo SecureStore 保存 API 密钥；网页端可能使用浏览器本地存储，请仅在可信设备上使用。',
    section: '连接信息',
    baseUrl: '接口地址（Base URL）',
    apiKey: 'API 密钥',
    model: '模型名称',
    save: '保存配置',
    testing: '测试中…',
    test: '测试连接',
  },
  answer: {
    previous: '上一题',
    submit: '提交答案',
    next: '下一题',
    exit: '退出测评',
  },
  result: {
    history: '历史结果',
    current: '测评结果',
    knowledgePoints: '知识点表现',
    wrongQuestions: (count: number) => `错题（${count}）`,
    wrongQuestionPage: (current: number, total: number) => `第 ${current} / ${total} 页`,
    previousWrongQuestions: '上一组错题',
    nextWrongQuestions: '下一组错题',
    noWrongAnswers: '没有错题。',
    correctAnswer: '正确答案',
    explanation: '题目解析',
    correctOption: '正确答案',
    yourSelection: '你的选择',
    unanswered: '未作答',
    backToHistory: '返回历史',
    createAnother: '再创建一份',
  },
  alerts: {
    configAttention: '请检查模型配置',
    configSaved: '配置已保存',
    configSavedDetail: 'API 密钥仅保存在当前设备，并只会发送到你配置的模型服务。',
    configRequired: '请先配置模型',
    connectionWorks: '连接成功',
    connectionWorksDetail: '模型服务已成功返回响应。',
    connectionFailed: '连接失败',
    unknownConnectionError: '未知连接错误。',
    topicRequired: '请输入测评主题',
    topicRequiredDetail: '请输入你希望测评的能力或知识领域。',
    unknownGenerationError: '生成测评时发生未知错误。',
    truncatedHint: '如果模型输出被截断，请尝试生成 50 道题。',
    draftNotSaved: '草稿未保存',
    draftNotSavedDetail: '测评已经打开，但未能保存到本地数据库。',
    unanswered: '还有题目未作答',
    unansweredDetail: (count: number) => `还有 ${count} 道题没有作答。`,
    historyNotSaved: '结果未保存',
    historyNotSavedDetail: '当前可以查看测评结果，但未能保存到本地历史记录。',
    answerNotSaved: '答案未保存',
    answerNotSavedDetail: '答案已在页面中选中，但未能保存到本地数据库。',
  },
} as const;

const difficultyCopy: Record<QuestionDifficulty, string> = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
};

const exactErrors: Record<string, string> = {
  'Base URL must be a valid URL.': '请输入有效的接口地址（Base URL）。',
  'API Key is required.': '请输入 API 密钥。',
  'Model is required.': '请输入模型名称。',
  'Model provider did not return message content.': '模型服务没有返回消息内容。',
  'Model response looked like HTML/XML instead of assessment JSON. Check the provider endpoint and model response format.':
    '模型返回了 HTML/XML，而不是测评 JSON。请检查接口地址和模型输出格式。',
  'Model response did not contain a JSON object.': '模型响应中没有找到 JSON 对象。',
  'Model response contained a JSON-looking block, but it was not valid JSON.': '模型响应中包含类似 JSON 的内容，但格式无效。',
};

export function formatDifficulty(difficulty: QuestionDifficulty): string {
  return difficultyCopy[difficulty];
}

export function formatQuestionProgress(current: number, total: number): string {
  return `第 ${current} / ${total} 题`;
}

export function formatHistoryStatus(
  status: AssessmentRecordStatus,
  correctCount?: number,
  totalQuestions?: number,
): string {
  return status === 'completed' && correctCount !== undefined && totalQuestions !== undefined
    ? `答对 ${correctCount}/${totalQuestions} 题`
    : '进行中';
}

export function formatChineseDate(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function localizeErrorMessage(message: string): string {
  if (exactErrors[message]) return exactErrors[message];

  const providerStatus = message.match(/^Model provider returned (\d+):\s*(.*)$/s);
  if (providerStatus) return `模型服务返回 ${providerStatus[1]}：${providerStatus[2]}`;

  const providerMediaType = message.match(/^Model provider returned (.+) instead of JSON\./s);
  if (providerMediaType) return `模型服务返回了 ${providerMediaType[1]}，而不是 JSON。请检查接口地址是否指向 OpenAI 兼容的 /v1 端点。`;

  const invalidJson = message.match(/^Model provider response was not valid JSON:\s*(.*)$/s);
  if (invalidJson) return `模型服务返回的不是有效 JSON：${invalidJson[1]}`;

  const inventedImage = message.match(/^Question ([^ ]+) image URL was not supplied in the topic or notes\.$/);
  if (inventedImage) return `第 ${inventedImage[1]} 题使用了未在测评主题或补充说明中提供的图片地址。`;

  const invalidAssessment = message.match(/^Generated assessment is invalid:\s*(.*)$/s);
  if (invalidAssessment) return `生成的测评数据不完整：${localizeValidationDetails(invalidAssessment[1] ?? '')}`;

  return message;
}

function localizeValidationDetails(details: string): string {
  return details
    .replace(/Question count must be 50 or 100\./g, '题目数量必须为 50 或 100 道。')
    .replace(/Questions must be an array\./g, '题目列表必须是数组。')
    .replace(/Expected (\d+) questions but received (\d+)\./g, '应生成 $1 道题，但实际收到 $2 道。')
    .replace(/Scoring levels are required\./g, '缺少评分等级。')
    .replace(/Scoring levels must cover 0 through 100 percent without gaps\./g, '评分等级必须连续覆盖 0% 到 100%。')
    .replace(/Question ID ([^ ]+) must be unique\./g, '题目 ID $1 不能重复。')
    .replace(/Question ID is required\./g, '题目缺少 ID。')
    .replace(/Question ([^ ]+) prompt is required\./g, '第 $1 题缺少题目内容。')
    .replace(/Question ([^ ]+) has unsupported type ([^.]+)\./g, '第 $1 题使用了不支持的题型 $2。')
    .replace(/Question ([^ ]+) has unsupported difficulty ([^.]+)\./g, '第 $1 题使用了不支持的难度 $2。')
    .replace(/Question ([^ ]+) knowledgePoint is required\./g, '第 $1 题缺少知识点。')
    .replace(/Question ([^ ]+) must have at least two options\./g, '第 $1 题至少需要两个选项。')
    .replace(/Question ([^ ]+) option ID ([^ ]+) must be unique\./g, '第 $1 题的选项 ID $2 不能重复。')
    .replace(/Question ([^ ]+) option ID is required\./g, '第 $1 题存在缺少 ID 的选项。')
    .replace(/Question ([^ ]+) option ([^ ]+) text is required\./g, '第 $1 题的 $2 选项缺少内容。')
    .replace(/Question ([^ ]+) correctOptionIds must be an array\./g, '第 $1 题的正确答案必须是数组。')
    .replace(/Question ([^ ]+) correct option ([^ ]+) does not exist in options\./g, '第 $1 题的正确答案 $2 不在选项中。')
    .replace(/Question ([^ ]+) (single_choice|true_false) questions must have exactly one correct option\./g, '第 $1 题必须且只能有一个正确选项。')
    .replace(/Question ([^ ]+) multiple_choice questions must have at least one correct option\./g, '第 $1 题至少需要一个正确选项。')
    .replace(/Question ([^ ]+) explanation is required\./g, '第 $1 题缺少答案解析。')
    .replace(/Question ([^ ]+) materials must be an array\./g, '第 $1 题的资料块必须是数组。')
    .replace(/Question ([^ ]+) materials must not contain more than (\d+) blocks\./g, '第 $1 题的资料块不能超过 $2 个。')
    .replace(/Question ([^ ]+) material (\d+) must be a JSON object\./g, '第 $1 题的第 $2 个资料块必须是 JSON 对象。')
    .replace(/Question ([^ ]+) material (\d+) has unsupported type ([^.]+)\./g, '第 $1 题的第 $2 个资料块使用了不支持的类型 $3。')
    .replace(/Question ([^ ]+) material (\d+) text is required\./g, '第 $1 题的第 $2 个资料文本不能为空。')
    .replace(/Question ([^ ]+) material (\d+) image uri must be a valid HTTPS URL\./g, '第 $1 题的第 $2 个图片资料必须使用有效的 HTTPS URL。')
    .replace(/Question ([^ ]+) material (\d+) image alt is required\./g, '第 $1 题的第 $2 个图片资料缺少替代文本。')
    .replace(/Question ([^ ]+) material (\d+) image caption must be non-empty when provided\./g, '第 $1 题的第 $2 个图片资料说明不能为空。')
    .replace(/Question ([^ ]+) material (\d+) image aspectRatio must be between ([\d.]+) and ([\d.]+)\./g, '第 $1 题的第 $2 个图片比例必须介于 $3 和 $4 之间。')
    .replace(/Question ([^ ]+) material (\d+) table caption must be non-empty when provided\./g, '第 $1 题的第 $2 个表格资料标题不能为空。')
    .replace(/Question ([^ ]+) material (\d+) table must have at least one column\./g, '第 $1 题的第 $2 个表格资料至少需要一列。')
    .replace(/Question ([^ ]+) material (\d+) table must not contain more than (\d+) columns\./g, '第 $1 题的第 $2 个表格资料不能超过 $3 列。')
    .replace(/Question ([^ ]+) material (\d+) table column (\d+) text is required\./g, '第 $1 题的第 $2 个表格资料第 $3 列不能为空。')
    .replace(/Question ([^ ]+) material (\d+) table must have at least one row\./g, '第 $1 题的第 $2 个表格资料至少需要一行。')
    .replace(/Question ([^ ]+) material (\d+) table must not contain more than (\d+) rows\./g, '第 $1 题的第 $2 个表格资料不能超过 $3 行。')
    .replace(/Question ([^ ]+) material (\d+) table row (\d+) must be an array\./g, '第 $1 题的第 $2 个表格资料第 $3 行必须是数组。')
    .replace(/Question ([^ ]+) material (\d+) table row (\d+) must have (\d+) cells\./g, '第 $1 题的第 $2 个表格资料第 $3 行必须有 $4 个单元格。')
    .replace(/Question ([^ ]+) material (\d+) table row (\d+) cell (\d+) text is required\./g, '第 $1 题的第 $2 个表格资料第 $3 行第 $4 个单元格不能为空。')
    .replace(/Question ([^ ]+) material (\d+) bar_chart title must be non-empty when provided\./g, '第 $1 题的第 $2 个柱状图资料标题不能为空。')
    .replace(/Question ([^ ]+) material (\d+) bar_chart unit must be non-empty when provided\./g, '第 $1 题的第 $2 个柱状图资料单位不能为空。')
    .replace(/Question ([^ ]+) material (\d+) bar_chart must have at least two items\./g, '第 $1 题的第 $2 个柱状图资料至少需要两项数据。')
    .replace(/Question ([^ ]+) material (\d+) bar_chart must not contain more than (\d+) items\./g, '第 $1 题的第 $2 个柱状图资料不能超过 $3 项数据。')
    .replace(/Question ([^ ]+) material (\d+) bar_chart item (\d+) must be a JSON object\./g, '第 $1 题的第 $2 个柱状图资料第 $3 项必须是 JSON 对象。')
    .replace(/Question ([^ ]+) material (\d+) bar_chart item (\d+) label is required\./g, '第 $1 题的第 $2 个柱状图资料第 $3 项缺少标签。')
    .replace(/Question ([^ ]+) material (\d+) bar_chart item (\d+) value must be greater than or equal to 0\./g, '第 $1 题的第 $2 个柱状图资料第 $3 项的数值必须大于或等于 0。')
    .replace(/Question ([^ ]+) material (\d+) bar_chart item (\d+) displayValue must be non-empty when provided\./g, '第 $1 题的第 $2 个柱状图资料第 $3 项显示值不能为空。')
    .replace(/。\s+/g, '。');
}
