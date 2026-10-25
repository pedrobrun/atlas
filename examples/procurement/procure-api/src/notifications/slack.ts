import { WebClient } from '@slack/web-api';

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

export interface ApprovalCard {
  slackUserId: string;
  requisitionNumber: string;
  title: string;
  requesterName: string;
  amountLabel: string;
  dueLabel: string;
  portalUrl: string;
}

export async function sendApprovalDm(card: ApprovalCard): Promise<void> {
  await slack.chat.postMessage({
    channel: card.slackUserId,
    text: `${card.requesterName} needs your approval for ${card.requisitionNumber} (${card.amountLabel})`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${card.requisitionNumber}: ${card.title}*\nRequested by ${card.requesterName} for *${card.amountLabel}*\nDue ${card.dueLabel}`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Review in portal' },
            url: card.portalUrl,
            style: 'primary',
          },
        ],
      },
    ],
  });
}

export async function sendDirectMessage(slackUserId: string, text: string): Promise<void> {
  await slack.chat.postMessage({ channel: slackUserId, text });
}

export async function postEscalation(text: string): Promise<void> {
  const channel = process.env.SLACK_ESCALATIONS_CHANNEL;
  if (!channel) throw new Error('SLACK_ESCALATIONS_CHANNEL is not set');
  await slack.chat.postMessage({ channel, text, unfurl_links: false });
}
