from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """?page=1&page_size=20 → {count, next, previous, results}（PRD §8.1）"""

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 1000
