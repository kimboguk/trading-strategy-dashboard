import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from bridge.engine_adapter import get_data_loader
DataLoader = get_data_loader()
loader = DataLoader()
import pandas as pd

m1 = loader.load_m1('EURUSD')
print(f'Total M1 bars: {len(m1):,}')
print(f'tick_volume == 0: {(m1.tick_volume == 0).sum():,} ({(m1.tick_volume == 0).mean()*100:.1f}%)')

m1['year'] = m1.index.year
yearly_stats = []
for year, grp in m1.groupby('year'):
    n = len(grp)
    zero = (grp['tick_volume'] == 0).sum()
    yearly_stats.append({
        'year': year, 'bars': n, 'zero_vol': zero,
        'zero_pct': round(zero/n*100, 1),
        'avg_vol': round(grp['tick_volume'].mean(), 1)
    })

df = pd.DataFrame(yearly_stats)
print()
print(df.to_string(index=False))
