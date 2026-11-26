// Ported from Jennifer (src/company/businessAgents.ts). Generated; edit in Jennifer and re-port.
import type { BusinessAgent } from './core';

export const BUSINESS_AGENTS: BusinessAgent[] = [
  {
    "companyId": "learnnoelia",
    "name": "LearnNoelia agent",
    "mission": "Grow real usage of LearnNoelia with adult learners and individual teachers before any school sale.",
    "routine": {
      "name": "learn Noelia",
      "does": "Daily campaign pack and up to five new qualified prospects among teachers and tutors."
    },
    "guardrails": [
      "Adult and public online users first; no school pilots for now.",
      "Describe only what the platform does today; no claims about features or results that are not in the approved brain."
    ],
    "measures": [
      "signups",
      "demo interest",
      "active learners",
      "teacher time saved (once measured)"
    ],
    "tasks": [
      {
        "id": "prospects",
        "name": "Qualify teachers and tutors",
        "department": "sales",
        "cadence": "daily",
        "does": "Qualify individual language teachers and tutors. The daily Claude routine finds and drafts; this task qualifies what it logged, drops duplicates and anyone on the do-not-contact list, and proposes the next step for each.",
        "inputs": [
          "icp",
          "offer",
          "CRM contacts"
        ],
        "outputs": [
          "teacher email and short DM drafts",
          "CRM tasks"
        ],
        "approval": "Drafts and CRM changes wait for Bruno."
      },
      {
        "id": "content",
        "name": "Learner content week",
        "department": "marketing",
        "cadence": "weekly",
        "does": "Plan the week of posts aimed at adult learners, with one clear call to action the site supports today.",
        "inputs": [
          "offer",
          "brand",
          "claims",
          "audience"
        ],
        "outputs": [
          "post drafts"
        ],
        "approval": "Each post waits for Bruno."
      },
      {
        "id": "feedback",
        "name": "Learner and teacher feedback",
        "department": "customer",
        "cadence": "weekly",
        "does": "Summarize feedback and support questions, and propose follow-ups for new signups.",
        "inputs": [
          "faq",
          "procedures",
          "connected inbox"
        ],
        "outputs": [
          "feedback summary",
          "follow-up drafts"
        ],
        "approval": "Follow-ups wait for Bruno."
      }
    ]
  }
];

export const BUSINESS_AGENT: BusinessAgent = BUSINESS_AGENTS[0];
