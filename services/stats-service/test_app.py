import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).parent))
from app import IncidentInput, api, create_incident, insert_incident


class IncidentApiTests(unittest.TestCase):
    def setUp(self):
        self.incident = IncidentInput(
            title='ไฟทางเดินดับบริเวณหน้าตึก ICT',
            description='บริเวณทางเดินชั้น 1 มืดมาก',
            category='facility',
            urgency_level=3,
        )

    def test_incident_input_rejects_invalid_values(self):
        with self.assertRaises(ValidationError):
            IncidentInput(
                title='ไฟ',
                description='รายละเอียด',
                category='facility',
                urgency_level=3,
            )

        with self.assertRaises(ValidationError):
            IncidentInput(
                title='หัวข้อแจ้งเหตุ',
                description='รายละเอียด',
                category='unknown',
                urgency_level=3,
            )

        with self.assertRaises(ValidationError):
            IncidentInput(
                title='หัวข้อแจ้งเหตุ',
                description='รายละเอียด',
                category='facility',
                urgency_level=6,
            )

    def test_post_incidents_route_is_registered(self):
        self.assertTrue(
            any(route.path == '/incidents' and 'POST' in route.methods for route in api.routes)
        )

    def test_insert_incident_binds_values_as_query_parameters(self):
        returned_row = {'id': 1, 'title': self.incident.title}
        cursor = Mock()
        cursor.__enter__ = Mock(return_value=cursor)
        cursor.__exit__ = Mock(return_value=False)
        cursor.fetchone.return_value = returned_row
        connection = Mock()
        connection.cursor.return_value = cursor

        with patch('app.get_db_connection', return_value=connection):
            result = insert_incident(self.incident)

        query, parameters = cursor.execute.call_args.args
        self.assertIn('VALUES (%s, %s, %s, %s)', query)
        self.assertNotIn(self.incident.title, query)
        self.assertEqual(
            parameters,
            (
                self.incident.title,
                self.incident.description,
                self.incident.category,
                self.incident.urgency_level,
            ),
        )
        self.assertEqual(result, returned_row)
        connection.commit.assert_called_once()
        connection.close.assert_called_once()

    def test_create_incident_returns_saved_row(self):
        expected = {'id': 1, 'title': self.incident.title}
        with patch('app.insert_incident', return_value=expected):
            result = create_incident(self.incident)

        self.assertEqual(result, expected)


if __name__ == '__main__':
    unittest.main()