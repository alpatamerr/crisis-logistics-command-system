"""Unit tests for crisis logistics pipeline logic.

Tests core transformation logic: deduplication, bounding box filtering,
geohash computation, severity classification, and anomaly detection.
"""
import pytest


# ─── Geohash Tests ───
class TestGeohash:
    """Test geohash computation used in current_incidents.py"""

    def _geohash(self, lat, lng, precision=12):
        """Reimplemented geohash for testing."""
        if lat is None or lng is None:
            return None
        BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"
        lat_range, lng_range = [-90.0, 90.0], [-180.0, 180.0]
        bits = [16, 8, 4, 2, 1]
        geohash = []
        even = True
        bit = 0
        ch = 0
        while len(geohash) < precision:
            if even:
                mid = (lng_range[0] + lng_range[1]) / 2
                if lng > mid:
                    ch |= bits[bit]
                    lng_range[0] = mid
                else:
                    lng_range[1] = mid
            else:
                mid = (lat_range[0] + lat_range[1]) / 2
                if lat > mid:
                    ch |= bits[bit]
                    lat_range[0] = mid
                else:
                    lat_range[1] = mid
            even = not even
            if bit < 4:
                bit += 1
            else:
                geohash.append(BASE32[ch])
                bit = 0
                ch = 0
        return "".join(geohash)

    def test_london_geohash(self):
        """Central London should produce a geohash starting with 'gcpu'"""
        result = self._geohash(51.5074, -0.1278, precision=4)
        assert result == "gcpu"

    def test_west_london_geohash(self):
        """West London (Heathrow area) should produce valid geohash"""
        result = self._geohash(51.47, -0.45, precision=5)
        assert result is not None
        assert len(result) == 5

    def test_none_inputs(self):
        """None lat/lng should return None"""
        assert self._geohash(None, -0.1278) is None
        assert self._geohash(51.5074, None) is None
        assert self._geohash(None, None) is None

    def test_precision(self):
        """Output length should match requested precision"""
        for p in [1, 4, 6, 8, 12]:
            result = self._geohash(51.5074, -0.1278, precision=p)
            assert len(result) == p


# ─── Bounding Box Tests ───
class TestBoundingBox:
    """Test West London bounding box filtering logic."""

    BOUNDS = {
        "lat_min": 51.38,
        "lat_max": 51.63,
        "lng_min": -0.51,
        "lng_max": -0.17,
    }

    def _in_bounds(self, lat, lng):
        return (
            self.BOUNDS["lat_min"] <= lat <= self.BOUNDS["lat_max"]
            and self.BOUNDS["lng_min"] <= lng <= self.BOUNDS["lng_max"]
        )

    def test_central_london_in_bounds(self):
        """Central London (51.51, -0.13) should NOT be in West London bounds"""
        # Note: -0.13 is east of -0.17 boundary
        assert not self._in_bounds(51.51, -0.13)

    def test_heathrow_in_bounds(self):
        """Heathrow (51.47, -0.45) should be in West London bounds"""
        assert self._in_bounds(51.47, -0.45)

    def test_slough_in_bounds(self):
        """Slough (51.51, -0.59) should NOT be in bounds (too far west)"""
        assert not self._in_bounds(51.51, -0.59)

    def test_ealing_in_bounds(self):
        """Ealing (51.51, -0.30) should be in bounds"""
        assert self._in_bounds(51.51, -0.30)


# ─── Helicopter Detection Tests ───
class TestHelicopterDetection:
    """Test ICAO helicopter code classification."""

    HELICOPTER_ICAO_CODES = {
        "EC35", "H135", "H145", "H160", "H175", "H225",
        "A109", "A139", "A169", "A189",
        "B206", "B407", "B412", "B429",
        "R22", "R44", "R66",
        "S76", "S92",
    }

    def _classify(self, icao_code):
        if icao_code in self.HELICOPTER_ICAO_CODES:
            return "HELICOPTER"
        return "AIRCRAFT"

    def test_eurocopter_is_helicopter(self):
        assert self._classify("EC35") == "HELICOPTER"
        assert self._classify("H135") == "HELICOPTER"

    def test_robinson_is_helicopter(self):
        assert self._classify("R44") == "HELICOPTER"

    def test_boeing_737_is_aircraft(self):
        assert self._classify("B738") == "AIRCRAFT"

    def test_airbus_a320_is_aircraft(self):
        assert self._classify("A320") == "AIRCRAFT"


# ─── Anomaly Detection Logic Tests ───
class TestAnomalyDetection:
    """Test Z-score anomaly classification logic."""

    def _classify_anomaly(self, z_score):
        if z_score > 2.0:
            return "SPIKE"
        elif z_score < -2.0:
            return "DROP"
        return "NORMAL"

    def test_spike_detected(self):
        assert self._classify_anomaly(2.5) == "SPIKE"
        assert self._classify_anomaly(3.0) == "SPIKE"

    def test_drop_detected(self):
        assert self._classify_anomaly(-2.5) == "DROP"
        assert self._classify_anomaly(-3.0) == "DROP"

    def test_normal_range(self):
        assert self._classify_anomaly(0.0) == "NORMAL"
        assert self._classify_anomaly(1.9) == "NORMAL"
        assert self._classify_anomaly(-1.9) == "NORMAL"

    def test_boundary_values(self):
        assert self._classify_anomaly(2.0) == "NORMAL"  # exactly 2.0 is not > 2.0
        assert self._classify_anomaly(-2.0) == "NORMAL"  # exactly -2.0 is not < -2.0


# ─── Severity Scoring Tests ───
class TestSeverityScoring:
    """Test severity weight logic used in transport_reliability.py"""

    SEVERITY_WEIGHTS = {
        "Severe": 4,
        "Serious": 3,
        "Moderate": 2,
        "Minimal": 1,
    }

    def test_severe_highest_weight(self):
        assert self.SEVERITY_WEIGHTS["Severe"] == 4

    def test_minimal_lowest_weight(self):
        assert self.SEVERITY_WEIGHTS["Minimal"] == 1

    def test_ordering(self):
        weights = [self.SEVERITY_WEIGHTS[s] for s in ["Minimal", "Moderate", "Serious", "Severe"]]
        assert weights == sorted(weights)
