from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Query


@dataclass(frozen=True)
class PageParams:
    page: int
    page_size: int


def page_params(
    page: Annotated[int, Query(ge=1, le=10_000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> PageParams:
    return PageParams(page, page_size)


Paging = Annotated[PageParams, Depends(page_params)]
SearchQuery = Annotated[str | None, Query(max_length=100)]
