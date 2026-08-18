from typing import Any, Literal

from pydantic import BaseModel, Field


# "no_model" is deliberately not folded into "insufficient_evidence": the sources
# were found and were enough: what is missing is a model to reason over them.
# Reporting a configuration problem as a gap in the CMS would send whoever reads
# it looking for content that is already there.
RagStatus = Literal["answered", "insufficient_evidence", "no_model"]
SourceType = Literal["publication", "member", "project", "news", "software", "thesisTopic"]


class RagRequest(BaseModel):
    question: str = Field(min_length=1)
    scope: list[str] = Field(default_factory=list)
    limit: int | None = None
    compareModels: bool = False
    comparisonModels: list[str] = Field(default_factory=list)


class RagCitation(BaseModel):
    title: str
    year: int | None = None
    type: SourceType
    url: str
    doi: str | None = None
    openalexId: str | None = None


class RagGroundedEvidence(BaseModel):
    claim: str
    sourceIds: list[str] = Field(default_factory=list)


class RagAnswer(BaseModel):
    executiveSummary: str
    evidence: list[str]
    groundedEvidence: list[RagGroundedEvidence] = Field(default_factory=list)
    limitations: list[str]
    suggestedReadings: list[dict[str, Any]]


class RagMetadata(BaseModel):
    provider: str | None = None
    model: str | None = None
    promptVersion: str = "rag-admin-v1"
    sourceCount: int = 0
    latencyMs: int = 0
    tokens: dict[str, int | None] | None = None
    cost: float | None = None


class RagModelComparison(BaseModel):
    provider: str | None = None
    model: str
    answer: RagAnswer
    latencyMs: int


class RagResponse(BaseModel):
    status: RagStatus
    answer: RagAnswer | None
    citations: list[RagCitation]
    metadata: RagMetadata
    warnings: list[str] = Field(default_factory=list)
    modelComparisons: list[RagModelComparison] = Field(default_factory=list)


class RagSource(BaseModel):
    id: int | str
    type: SourceType
    title: str
    text: str
    url: str
    year: int | None = None
    doi: str | None = None
    openalexId: str | None = None
    score: float = 0.0

    def source_id(self) -> str:
        return f"{self.type}:{self.id}"

    def citation(self) -> RagCitation:
        return RagCitation(
            title=self.title,
            year=self.year,
            type=self.type,
            url=self.url,
            doi=self.doi,
            openalexId=self.openalexId,
        )
