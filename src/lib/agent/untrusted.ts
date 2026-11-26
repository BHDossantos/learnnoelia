// Ported from Jennifer (github.com/BHDossantos/jennifer, src/security/untrusted.ts). Keep in sync there.
/**
 * Untrusted content handling (spec §17). Emails, messages, websites,
 * documents and tool outputs are data, never instructions. They are wrapped
 * with provenance labels before reaching a model, and suspicious content is
 * flagged and preserved as evidence. Enforcement does NOT rely on detection:
 * tool permissions are checked in code by the executor regardless.
 */
export interface UntrustedBlock {
  source: string; // e.g. 'email:msg_123 from alice@example.com'
  content: string;
  flags: string[];
}

const INJECTION_PATTERNS: Array<[string, RegExp]> = [
  ['instruction_override', /\b(ignore|disregard|forget)\b[^.]{0,40}\b(previous|prior|above|your|all)\b[^.]{0,20}\b(instructions|rules|prompt|guidelines)\b/i],
  ['exfiltration_request', /\b(forward|send|share|export|upload)\b[^.]{0,60}\b(all|every|entire)\b[^.]{0,40}\b(emails?|messages|statements|documents|files|contacts|history)\b/i],
  ['credential_request', /\b(send|share|provide|tell|give|reply with|enter|confirm)\b[^.]{0,40}\b(password|verification code|2fa|otp|one[- ]time code|authentication code|security code|login code)\b/i],
  ['settings_change', /\b(change|update|disable|turn off)\b[^.]{0,40}\b(settings|permissions|forwarding|rules|security|2fa)\b/i],
  ['role_play', /\b(you are now|act as|new system prompt|developer mode)\b|\b(system|assistant)\s*:/i],
  // Italian, Brazilian Portuguese and Spanish (Bruno's languages; spec §20 multilingual adversarial cases).
  ['instruction_override', /\b(ignora|ignore|ignorar|dimentica|esqueça|esquece|olvida)\b[^.]{0,40}\b(istruzioni|regole|instruções|instrucoes|regras|instrucciones|reglas)\b/i],
  ['exfiltration_request', /\b(inoltra|invia|inviami|manda|mandami|condividi|encaminhe|encaminha|envie|envia|compartilhe|reenvía|reenvia|envía|envíame|enviame|mándame|comparte)\b[^.]{0,60}\b(tutte|tutti|todas|todos)\b[^.]{0,40}\b(e-?mails?|messaggi|mensagens|mensajes|estratti|extratos|extractos|documenti|documentos|contatti|contatos|contactos|correos)\b/i],
  ['credential_request', /\b(invia|inviami|dimmi|fornisci|manda|envie|me envie|informe|diga|envíame|envíe|dime|proporciona)\b[^.]{0,40}\b(password|senha|contraseña|codice di verifica|codice otp|código de verificação|código de verificación|código|codice)\b/i],
  ['settings_change', /\b(cambia|modifica|disattiva|altere|mude|desative|desativa|desactiva|cambie)\b[^.]{0,40}\b(impostazioni|permessi|inoltro|configurações|permissões|encaminhamento|configuración|permisos|reenvío)\b/i],
  // French (Company OS drafting language).
  ['instruction_override', /\b(ignorez|ignore|oubliez)\b[^.]{0,40}\b(instructions|règles|regles|consignes)\b/i],
  ['exfiltration_request', /\b(transférez|transferez|envoyez|envoyez-moi|partagez)\b[^.]{0,60}\b(tous|toutes)\b[^.]{0,40}\b(e-?mails?|messages|relevés|releves|documents|contacts|fichiers)\b/i],
  ['credential_request', /\b(envoyez|envoyez-moi|donnez|communiquez)\b[^.]{0,40}\b(mot de passe|code de vérification|code de verification|code)\b/i],
  // Patterns below adapted from OpenJarvis security/injection_scanner.py (Apache-2.0); see THIRD_PARTY_LICENSES.
  ['identity_override', /\byou\s+are\s+now\s+(?:a\s+)?(?:different|new|my)\b/i],
  ['code_injection', /\b(?:execute|run|eval)\s*\(\s*['"]/i],
  ['shell_injection', /(?:;|\||&&)\s*(?:rm|curl|wget|nc|ncat|bash|sh|python|perl)\s/],
  ['exfiltration_url', /\b(?:send|post|upload|exfiltrate|transmit)\s+(?:(?:to|data|all|everything)\s+)*(?:to\s+)?(?:https?:\/\/|my\s+server)/i],
  ['encoded_exfiltration', /\bbase64\s+encode\s+(?:and\s+)?(?:send|include|append)/i],
  ['jailbreak', /\b(?:DAN|do\s+anything\s+now)\s+(?:mode|prompt|jailbreak)|\bpretend\s+(?:you\s+)?(?:have\s+)?no\s+(?:restrictions?|limitations?|rules?|filters?)/i],
  ['delimiter_injection', /```(?:system|assistant)\b|<\|(?:im_start|im_end|system|assistant)\|>/i],
  ['hidden_text', /[\u200B-\u200F\u2060\uFEFF]|<span[^>]*(display:\s*none|font-size:\s*0)/i],
];

export function detectInjection(text: string): string[] {
  return [...new Set(INJECTION_PATTERNS.filter(([, re]) => re.test(text)).map(([k]) => k))];
}

/** Remove markup that could hide instructions; keep visible text as evidence. */
export function sanitizeForModel(text: string): string {
  // Walk the text instead of chaining regex replacements: script and style
  // blocks are dropped, other tags become a space, and any "<" left over
  // (an unclosed tag, or one that removing a tag joined back together) is
  // escaped so it can't start markup.
  let out = '';
  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf('<', i);
    if (lt === -1) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, lt);
    const gt = text.indexOf('>', lt + 1);
    if (gt === -1 || gt === lt + 1) {
      // "<" with no tag after it stays as text and is escaped below.
      out += '<';
      i = lt + 1;
      continue;
    }
    const block = /^(script|style)\b/i.exec(text.slice(lt + 1, gt));
    if (block) {
      const closing = new RegExp(`</${block[1]}[^>]*>`, 'gi');
      closing.lastIndex = gt + 1;
      const end = closing.exec(text);
      if (end) {
        i = end.index + end[0].length;
        continue;
      }
    }
    out += ' ';
    i = gt + 1;
  }
  return out
    .split('<')
    .join('&lt;')
    .replace(/[​-‏⁠﻿]/g, '')
    .replace(/\s+\n/g, '\n')
    .trim();
}

export function wrapUntrusted(source: string, content: string): UntrustedBlock {
  return { source, content: sanitizeForModel(content), flags: detectInjection(content) };
}

/**
 * Render an untrusted block for a model prompt. Delimiters are randomized per
 * call so embedded text cannot forge a closing tag.
 */
export function renderUntrusted(block: UntrustedBlock, nonce: string): string {
  const flagNote = block.flags.length ? ` flags="${block.flags.join(',')}"` : '';
  const safe = block.content.split(`</untrusted-${nonce}>`).join('');
  return `<untrusted-${nonce} source="${block.source}"${flagNote}>\n${safe}\n</untrusted-${nonce}>`;
}
