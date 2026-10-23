// SCORM 1.2 manifest (EXPERIMENTAL — milestone 3). The package must be tested in a real
// LMS before this output is described as supported. See docs/COMPATIBILITY.md.

import { escapeHtml } from '../core/html.js';

export function scorm12Manifest(state, files) {
  const id = state.manifest.id.replace(/[^\w.-]/g, '_');
  const title = escapeHtml(state.manifest.course.title || 'Course');
  const assessments = state.manifest.lessons.map((l) => state.lessons[l]).filter((l) => l?.kind === 'assessment');
  const mastery = assessments.length ? `\n        <adlcp:masteryscore>${Math.round(Number(assessments[0].assessment?.passThreshold) || 80)}</adlcp:masteryscore>` : '';
  const fileList = files
    .filter((f) => f !== 'imsmanifest.xml')
    .map((f) => `      <file href="${escapeHtml(f.split('/').map(encodeURIComponent).join('/'))}"/>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${id}" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="org_${id}">
    <organization identifier="org_${id}">
      <title>${title}</title>
      <item identifier="item_${id}" identifierref="res_${id}" isvisible="true">
        <title>${title}</title>${mastery}
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="res_${id}" type="webcontent" adlcp:scormtype="sco" href="index.html">
${fileList}
    </resource>
  </resources>
</manifest>
`;
}
