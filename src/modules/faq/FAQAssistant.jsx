import React from 'react';
import { Btn, Card, Input, SectionHeader } from '../../components/ui/index.jsx';

const suggestionPrompts = [
  'Comment reduire le food cost cette semaine ?',
  'Que verifier avant un service HACCP ?',
  'Comment traiter une perte matiere ?',
  'Quelles SOPs lancer avant le rush ?',
];

const automationScopes = [
  { id: 'pointage', title: 'Pointages', detail: 'Retards, arrivees manquantes et shifts sans depart.', page: 'planning', tone: 'var(--warning-strong)' },
  { id: 'haccp', title: 'HACCP', detail: 'Controles du jour, temperatures hors plage et rappels.', page: 'haccp', tone: 'var(--success-strong)' },
  { id: 'pertes', title: 'Pertes', detail: 'Pertes a valider, ecarts matiere et priorites stock.', page: 'pertes', tone: 'var(--danger-strong)' },
  { id: 'sop', title: 'SOPs', detail: 'Routines a executer selon jour, role et service.', page: 'sop', tone: '#1a5276' },
  { id: 'factures', title: 'Factures', detail: 'Previsualisation, logo et preparation client.', page: 'factures', tone: 'var(--accent)' },
];

const starterMessages = [
  {
    role: 'assistant',
    text: 'Bonjour. La FAQ metier est prete. Je peux deja aider sur food cost, HACCP, pertes, SOPs et factures avec des reponses locales.',
  },
];

export default function FAQAssistant({ user, etablissement, setPage }) {
  const [messages, setMessages] = React.useState(starterMessages);
  const [input, setInput] = React.useState('');
  const canNavigate = typeof setPage === 'function';

  const send = () => {
    const question = input.trim();
    if (!question) return;
    setInput('');
    setMessages((items) => [
      ...items,
      { role: 'user', text: question },
      { role: 'assistant', text: getLocalAnswer(question, user, etablissement) },
    ]);
  };

  const ask = (question) => {
    setInput(question);
  };

  const goTo = (page) => {
    if (canNavigate) setPage(page);
  };

  return (
    <div style={fs.root}>
      <div style={fs.header}>
        <div style={fs.avatar}>JS</div>
        <div style={{ minWidth: 0 }}>
          <div style={fs.title}>FAQ & Assistant IA</div>
          <div style={fs.subtitle}>{etablissement?.nom || 'Etablissement'} · {user?.prenom || 'Equipe'}</div>
        </div>
        <span style={fs.status}>Fallback local actif</span>
      </div>

      <div style={fs.layout}>
        <Card style={fs.chatCard}>
          <SectionHeader title="Assistant metier" sub="Food cost, HACCP, recettes, pertes, SOPs et factures" />
          <div style={fs.suggestions}>
            {suggestionPrompts.map((prompt) => (
              <button key={prompt} type="button" style={fs.suggestion} onClick={() => ask(prompt)}>
                {prompt}
              </button>
            ))}
          </div>

          <div style={fs.messages}>
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} style={{ ...fs.messageRow, justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{ ...fs.bubble, ...(message.role === 'user' ? fs.userBubble : fs.assistantBubble) }}>
                  {message.text}
                </div>
              </div>
            ))}
          </div>

          <div style={fs.inputRow}>
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') send();
              }}
              placeholder="Question metier..."
              style={{ flex: 1 }}
            />
            <Btn variant="primary" onClick={send}>Envoyer</Btn>
          </div>
        </Card>

        <div style={fs.sideColumn}>
          <Card>
            <SectionHeader title="Automatisations" sub="Cibles a brancher progressivement" />
            <div style={fs.automationList}>
              {automationScopes.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  style={fs.automationItem}
                  onClick={() => goTo(item.page)}
                  disabled={!canNavigate}
                >
                  <span style={{ ...fs.automationDot, background: item.tone }} />
                  <span style={fs.automationText}>
                    <span style={fs.automationTitle}>{item.title}</span>
                    <span style={fs.automationDetail}>{item.detail}</span>
                  </span>
                </button>
              ))}
            </div>
          </Card>

          <Card style={fs.scopeCard}>
            <SectionHeader title="Connexion IA future" sub="Aucun appel externe pour le moment" />
            <div style={fs.scopeList}>
              <span>Edge Function Supabase</span>
              <span>Journalisation des demandes</span>
              <span>Contexte par role et etablissement</span>
              <span>Garde-fous donnees sensibles</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function getLocalAnswer(question, user, etablissement) {
  const text = question.toLowerCase();
  const roleHint = user?.role === 'consultant' ? 'Priorite consultant: diagnostic, delegation et suivi client.' : 'Priorite equipe: action simple et traçable.';
  const etabHint = etablissement?.nom ? `Contexte: ${etablissement.nom}.` : '';

  if (text.includes('food') || text.includes('cost') || text.includes('cout')) {
    return `${roleHint} ${etabHint} Controle les 20 produits les plus chers, compare prix d achat et portions, puis cible les recettes au-dessus de 32% de food cost.`;
  }
  if (text.includes('haccp') || text.includes('temperature') || text.includes('controle')) {
    return `${roleHint} ${etabHint} Priorise les temperatures froides, les controles en retard et les commentaires hors plage. Une anomalie doit etre corrigee puis documentee.`;
  }
  if (text.includes('perte') || text.includes('matiere')) {
    return `${roleHint} ${etabHint} Valide les pertes non traitees, classe-les par valeur CHF, puis relie les plus fortes a une cause: preparation, stockage, commande ou service.`;
  }
  if (text.includes('sop') || text.includes('procedure') || text.includes('rush')) {
    return `${roleHint} ${etabHint} Lance d abord les SOPs critiques: mise en place, reception, nettoyage et HACCP. Les routines repetables doivent etre cochees avant le service.`;
  }
  if (text.includes('facture') || text.includes('client')) {
    return `${roleHint} ${etabHint} Verifie logo et etablissement courant, controle HT/TTC, puis garde l aperçu facture comme derniere validation avant PDF ou email.`;
  }
  return `${roleHint} ${etabHint} Je peux repondre localement sur food cost, HACCP, pertes, SOPs, factures et organisation quotidienne.`;
}

const fs = {
  root: { display: 'flex', flexDirection: 'column', gap: 16 },
  header: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '14px 18px', background: 'var(--grad-accent-wash)', border: '1px solid var(--accent-bd)', borderRadius: 'var(--r-sm)' },
  avatar: { width: 44, height: 44, borderRadius: 10, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 },
  title: { fontSize: 18, fontWeight: 900, color: 'var(--text)', fontFamily: 'var(--font-serif)' },
  subtitle: { fontSize: 12, color: 'var(--text2)', marginTop: 2 },
  status: { marginLeft: 'auto', padding: '5px 9px', borderRadius: 999, background: 'var(--success-bg-soft)', color: 'var(--success-text)', border: '1px solid var(--success-bd)', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' },
  layout: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 },
  chatCard: { display: 'flex', flexDirection: 'column', minHeight: 520 },
  suggestions: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  suggestion: { padding: '7px 11px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text2)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' },
  messages: { flex: 1, minHeight: 280, maxHeight: 420, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8 },
  messageRow: { display: 'flex' },
  bubble: { maxWidth: '74%', padding: '10px 13px', borderRadius: 10, fontSize: 13, lineHeight: 1.55, color: 'var(--text)' },
  assistantBubble: { background: 'var(--accent-light)', border: '1px solid var(--accent-bd)', borderTopLeftRadius: 3 },
  userBubble: { background: 'var(--surface2)', border: '1px solid var(--border)', borderTopRightRadius: 3 },
  inputRow: { display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' },
  sideColumn: { display: 'flex', flexDirection: 'column', gap: 14 },
  automationList: { display: 'flex', flexDirection: 'column', gap: 8 },
  automationItem: { display: 'grid', gridTemplateColumns: '8px minmax(0, 1fr)', gap: 10, width: '100%', padding: '10px 11px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font)' },
  automationDot: { width: 8, height: 8, borderRadius: 999, marginTop: 4 },
  automationText: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  automationTitle: { fontSize: 13, fontWeight: 900, color: 'var(--text)' },
  automationDetail: { fontSize: 11, color: 'var(--text2)', lineHeight: 1.4 },
  scopeCard: { background: 'var(--surface2)' },
  scopeList: { display: 'grid', gap: 8, fontSize: 12, color: 'var(--text2)', fontWeight: 700 },
};
