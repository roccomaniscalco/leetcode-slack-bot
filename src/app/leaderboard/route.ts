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

export async function POST() {
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
