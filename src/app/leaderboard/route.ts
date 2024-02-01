import { QuestionTable, db } from "@/db";
import { notNullish } from "@/ts-utils";
import {
  ChatPostMessageArguments,
  MrkdwnElement,
  WebClient,
} from "@slack/web-api";
import { Channel } from "@slack/web-api/dist/response/ConversationsListResponse";
import { gte } from "drizzle-orm";
import { z } from "zod";

const USERNAMES = ["roccomaniscalco2001", "PrettyLegit"];
const SUBMISSIONS_LIMIT = 10;
const currentWeek = getCurrentWeek(getStartDate(new Date()));

const submissionsQuery = `    
  query recentAcSubmissions($username: String!, $limit: Int!) {
    recentAcSubmissionList(username: $username, limit: $limit) {
      titleSlug
      timestamp
    }
  }
  `;

const submissionsSchema = z
  .object({
    recentAcSubmissionList: z.array(
      z.object({
        titleSlug: z.string(),
        timestamp: z.string(),
      })
    ),
  })
  .transform(({ recentAcSubmissionList }) => recentAcSubmissionList);

function getSubmissions(user: string) {
  return fetch("https://leetcode.com/graphql", {
    next: { revalidate: 0 }, // Always revalidate
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operationName: "recentAcSubmissions",
      query: submissionsQuery,
      variables: {
        username: user,
        limit: SUBMISSIONS_LIMIT,
      },
    }),
  });
}

type Leaderboard = Record<string, boolean[]>;

export async function GET() {
  const questions = await db
    .select({ slug: QuestionTable.slug, createdAt: QuestionTable.createdAt })
    .from(QuestionTable)
    .where(gte(QuestionTable.createdAt, notNullish(currentWeek[0])))
    .then((res) => res.map(({ slug }) => slug));

  const submissionsByUser = await Promise.all(
    USERNAMES.flatMap((user) =>
      getSubmissions(user)
        .then((res) => res.json())
        .then(({ data }) => submissionsSchema.parseAsync(data))
        .then((submissions) => [user, submissions] as const)
    )
  );

  const leaderboard = submissionsByUser.reduce<Leaderboard>(
    (acc, [user, submissions]) => {
      acc[user] = currentWeek.map((date) => {
        const weekDay = date.toDateString();
        const submission = submissions.find(({ timestamp }) => {
          const submissionDay = new Date(+timestamp * 1000).toDateString();
          return submissionDay === weekDay;
        });
        return !!submission;
      });
      return acc;
    },
    {}
  );

  await postLeaderboardToSlack(leaderboard);
  return Response.json({ leaderboard, questions: questions }, { status: 200 });
}

async function postLeaderboardToSlack(leaderboard: Leaderboard) {
  const web = new WebClient(process.env.SLACK_TOKEN);

  for await (const page of web.paginate("conversations.list")) {
    for (const channel of page.channels as Channel[]) {
      if (channel.is_member && channel.id && !channel.is_archived) {
        const leaderboardMessage = getLeaderboardMessage(
          leaderboard,
          channel.id
        );
        const res = await web.chat.postMessage(leaderboardMessage);
        if (!res.ok) {
          console.error("Failed to post leaderboard to Slack", res);
        }
      }
    }
  }
}

function getLeaderboardMessage(
  leaderboard: Leaderboard,
  channelId: string
): ChatPostMessageArguments {
  const highScorers = getHighScorers(leaderboard);

  return {
    channel: channelId,
    mrkdwn: true,
    text: "Leaderboard",
    blocks: [
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `Weekly leaderboard:`,
          },
          {
            type: "mrkdwn",
            text: "`Ｍ` `Ｔ` `Ｗ` `Ｔ` `Ｆ`",
          },
          ...Object.entries(leaderboard).flatMap<MrkdwnElement>(
            ([username, submissions]) => [
              {
                type: "mrkdwn",
                text: `*${username}* ${
                  highScorers.includes(username) ? "👑" : ""
                }`,
              },
              {
                type: "mrkdwn",
                text: `${submissions
                  .map((b) => (b ? "`🟩`" : "`⬛️`"))
                  .join(" ")}`,
              },
            ]
          ),
        ],
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `${notNullish(
              currentWeek[0]
            ).toLocaleDateString()} - ${notNullish(
              currentWeek[4]
            ).toLocaleDateString()}`,
          },
        ],
      },
      {
        type: "divider",
      },
    ],
  };
}

// startDate is the most recent Monday at 12:00 UTC
function getStartDate(now: Date) {
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - ((startDate.getDay() + 6) % 7));
  startDate.setUTCHours(12, 0, 0, 0);
  return startDate;
}

// Return 5 day week from date
function getCurrentWeek(startDate: Date) {
  const currentWeek = [];
  for (let i = 0; i < 5; i++) {
    const day = new Date(startDate);
    day.setDate(day.getDate() + i);
    currentWeek.push(day);
  }
  return currentWeek;
}

function getHighScorers(leaderboard: Leaderboard) {
  const highScore = Object.values(leaderboard).reduce((acc, curr) => {
    const score = curr.filter((b) => b).length;
    return score > acc ? score : acc;
  }, 0);
  const highScorers = Object.entries(leaderboard).reduce<string[]>(
    (acc, curr) => {
      const score = curr[1].filter((b) => b).length;
      if (score === highScore) {
        acc.push(curr[0]);
      }
      return acc;
    },
    []
  );
  return highScorers;
}
