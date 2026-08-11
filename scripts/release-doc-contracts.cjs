const REQUIRED_CHECKLIST_TERMS = ['EdgeOne', 'HTTPS', 'Blob', 'request合法域名', 'preview', 'production'];
const REQUIRED_DEPLOYMENT_TERMS = ['EdgeOne', 'HTTPS', 'Blob', '环境变量', 'request合法域名', 'preview', 'production smoke'];
const REQUIRED_EDGEONE_FIELDS = [
  'projectId',
  'deploymentUrl',
  'productionApiOrigin',
  'deploymentVersion',
  'nodeFunctionsBuildSha256',
  'blobNamespace',
];
const REQUIRED_ARTIFACT_FIELDS = ['wechatDistSha256', 'edgeoneBuildSha256'];
const LEGACY_PATTERN = /cloudbase|TARO_APP_CLOUDBASE_ENV_ID|cloudbaseDistSha256|productionEnvId/i;
const SECRET_FIELD_PATTERN = /(?:secret|api[_-]?key|private[_-]?key|token|password)/i;

function inspectEdgeOneReleaseDocuments({ checklist, deployment, manifest, relatedDocuments = [] }) {
  const findings = [];
  inspectText('release checklist', checklist, REQUIRED_CHECKLIST_TERMS, findings);
  inspectText('deployment runbook', deployment, REQUIRED_DEPLOYMENT_TERMS, findings);
  for (const { label, source } of relatedDocuments) inspectLegacyReferences(label, source, findings);

  let parsedManifest;
  try {
    parsedManifest = JSON.parse(manifest);
  } catch {
    findings.push('release manifest must be valid JSON');
    return findings;
  }

  inspectLegacyReferences('release manifest', manifest, findings);
  for (const field of REQUIRED_EDGEONE_FIELDS) {
    if (!hasNonEmptyField(parsedManifest.edgeone, field)) findings.push(`release manifest requires edgeone.${field}`);
  }
  for (const field of REQUIRED_ARTIFACT_FIELDS) {
    if (!hasNonEmptyField(parsedManifest.artifacts, field)) findings.push(`release manifest requires artifacts.${field}`);
  }
  inspectSecretFields(parsedManifest, 'release manifest', findings);
  return findings;
}

function inspectText(label, source, requiredTerms, findings) {
  inspectLegacyReferences(label, source, findings);
  for (const term of requiredTerms) {
    if (!source.includes(term)) findings.push(`${label} requires ${term}`);
  }
}

function inspectLegacyReferences(label, source, findings) {
  if (LEGACY_PATTERN.test(source)) findings.push(`${label} contains forbidden CloudBase release dependency`);
}

function inspectSecretFields(value, path, findings) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectSecretFields(entry, `${path}[${index}]`, findings));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (SECRET_FIELD_PATTERN.test(key)) findings.push(`${childPath} must not contain a secret field`);
    inspectSecretFields(child, childPath, findings);
  }
}

function hasNonEmptyField(record, field) {
  return Boolean(record && typeof record[field] === 'string' && record[field].trim());
}

module.exports = { inspectEdgeOneReleaseDocuments };
