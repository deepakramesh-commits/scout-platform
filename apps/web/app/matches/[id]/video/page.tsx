import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading, Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { loadTool } from "@/lib/engine";
import { playbackUrl, provider } from "@/lib/video";
import { MatchHeader } from "../match-header";
import { Uploader } from "./uploader";

export const dynamic = "force-dynamic";

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { match } = await loadTool(id, ["coordinator"]);
  const src = match.video_status === "ready" ? playbackUrl(match) : null;
  const mux = provider() === "mux";
  return (
    <VStack gap={5} maxWidth={880}>
      <MatchHeader match={match} tool="Match video" intro="Upload the full match from one camera, as the filming standard describes. Analysts log events against this video." />
      <Card>
        <VStack gap={3}>
          <Heading level={2}>Current video</Heading>
          {src ? (
            <video className="match-video" src={src} controls preload="metadata" />
          ) : match.video_status === "uploading" || match.video_status === "processing" ? (
            <EmptyState isCompact title="Processing" description="The upload reached the video host and is being prepared. Refresh in a minute." />
          ) : (
            <EmptyState isCompact title="No video yet" description="Upload the match below." />
          )}
          {src && match.video_size && <Text type="supporting">{(Number(match.video_size) / 1024 / 1024).toFixed(1)} MB · stored {match.video_provider === "mux" ? "with Mux" : "on this server"}</Text>}
        </VStack>
      </Card>
      <Card>
        <VStack gap={3}>
          <Heading level={2}>{src ? "Replace the video" : "Upload"}</Heading>
          <Uploader matchId={id} mux={mux} />
        </VStack>
      </Card>
    </VStack>
  );
}
