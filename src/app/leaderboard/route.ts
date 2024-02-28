import { QuestionTable, db } from "@/db";
import { notNullish } from "@/ts-utils";
import { MrkdwnElement } from "@slack/web-api";
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
    .where(gte(QuestionTable.createdAt, currentWeek[0]));

  const submissionsByUser = await Promise.all(
    USERNAMES.flatMap((user) =>
      getSubmissions(user)
        .then((res) => res.json())
        .then(({ data }) => submissionsSchema.parseAsync(data))
        .then((submissions) => [user, submissions] as const)
    )
  );

  const leaderboard: Leaderboard = {};
  for (const [username, submissions] of submissionsByUser) {
    leaderboard[username] = [];
    const userLeaderboard = notNullish(leaderboard[username]);

    for (const day of currentWeek) {
      const question = questions.find(
        (q) => q.createdAt.toDateString() === day.toDateString()
      );
      const hasSubmittedQuestion = submissions.some(
        (s) => s.titleSlug === question?.slug
      );
      userLeaderboard.push(hasSubmittedQuestion);
    }
  }

  const leaderboardMessage = getLeaderboardMessage(leaderboard);
  return Response.json(leaderboardMessage, { status: 200 });
}

function getLeaderboardMessage(leaderboard: Leaderboard) {
  const highScorers = getHighScorers(leaderboard);

  return {
    response_type: "in_channel",
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
                text: submissions
                  .map((didSubmit) => (didSubmit ? "`🟩`" : "`⬛️`"))
                  .join(" "),
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
            text:
              currentWeek[0].toLocaleDateString() +
              " - " +
              currentWeek[4].toLocaleDateString(),
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
  const monday = startDate.getUTCDate() - ((startDate.getUTCDay() + 6) % 7);
  startDate.setUTCDate(monday);
  startDate.setUTCHours(12, 0, 0, 0);
  return startDate;
}

// return 5 day week from startDate
function getCurrentWeek(startDate: Date) {
  const currentWeek = [];
  for (let i = 0; i < 5; i++) {
    const day = new Date(startDate);
    day.setUTCDate(day.getUTCDate() + i);
    currentWeek.push(day);
  }
  return currentWeek as [Date, Date, Date, Date, Date];
}

// return list of users with the highest score
// if there are multiple users with the same highest score, return all of them
function getHighScorers(leaderboard: Leaderboard) {
  const highScore = Object.values(leaderboard).reduce((acc, curr) => {
    const score = curr.filter((b) => b).length;
    return score > acc ? score : acc;
  }, 0);
  const highScorers = Object.entries(leaderboard).reduce<string[]>(
    (acc, [username, submissions]) => {
      if (submissions.filter((b) => b).length === highScore) {
        acc.push(username);
      }
      return acc;
    },
    []
  );
  return highScorers;
}
