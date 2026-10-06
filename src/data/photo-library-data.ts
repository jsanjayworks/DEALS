/**
 * The deal photo library: topics, the words that call for each, and free
 * Unsplash photos (Unsplash License) that were checked one by one to show
 * that topic. Generated from a search of unsplash.com and a review of every
 * candidate; edit by hand to add or swap photos. See photo-library.ts.
 */

import type { Vertical } from './types';

export interface PhotoTopic {
  key: string;
  vertical: Vertical;
  /** Words in a deal that call for this topic, lower case. */
  tags: string[];
  /** Unsplash photo ids, the part after "photo-". */
  photos: string[];
}

export const PHOTO_TOPICS: PhotoTopic[] = [
  // ---- food
  {
    key: 'biryani',
    vertical: 'food',
    tags: ['biryani', 'pulao', 'dum'],
    photos: ['1631515243349-e0cb75fb8d3a', '1589302168068-964664d93dc0', '1563379091339-03b21ab4a4f8'],
  },
  {
    key: 'chicken-curry',
    vertical: 'food',
    tags: ['chicken curry', 'butter chicken', 'chicken masala', 'tikka masala', 'chicken'],
    photos: ['1708782341807-ed35fc16b4ea', '1742599361574-6fb156181466', '1728910107534-e04e261768ae'],
  },
  {
    key: 'kebab',
    vertical: 'food',
    tags: ['kebab', 'kabab', 'seekh', 'tandoori', 'tikka', 'grill', 'grilled', 'bbq', 'barbecue'],
    photos: ['1532636875304-0c89119d9b4d', '1705359573325-f2006d5e459f', '1620167790054-de54f34308bb'],
  },
  {
    key: 'fried-chicken',
    vertical: 'food',
    tags: ['fried chicken', 'wings', 'chicken wings', 'crispy chicken', 'chicken 65', 'chicken'],
    photos: ['1694853651800-3e9b4aa96a42', '1600555379765-f82335a7b1b0', '1586793783658-261cddf883ef'],
  },
  {
    key: 'shawarma',
    vertical: 'food',
    tags: ['shawarma', 'roll', 'rolls', 'wrap', 'wraps', 'kathi', 'frankie'],
    photos: ['1719282431565-3b30bb7d2658', '1629450748686-c86699b710ac', '1719282666354-38af51d0ba24'],
  },
  {
    key: 'pizza',
    vertical: 'food',
    tags: ['pizza', 'pizzas'],
    photos: ['1604382354936-07c5d9983bd3', '1628840042765-356cda07504e', '1565299624946-b28f40a0ae38'],
  },
  {
    key: 'burger',
    vertical: 'food',
    tags: ['burger', 'burgers'],
    photos: ['1572802419224-296b0aeee0d9', '1607013251379-e6eecfffe234', '1586190848861-99aa4a171e90'],
  },
  {
    key: 'fries',
    vertical: 'food',
    tags: ['fries', 'french fries', 'snacks', 'snack'],
    photos: ['1665117861973-fffa50c1afec', '1598679253544-2c97992403ea', '1688978181542-87a886a16fbe'],
  },
  {
    key: 'sandwich',
    vertical: 'food',
    tags: ['sandwich', 'sandwiches', 'sub', 'club sandwich'],
    photos: ['1509722747041-616f39b57569', '1539252554453-80ab65ce3586', '1655279562015-047c3da9a271'],
  },
  {
    key: 'pasta',
    vertical: 'food',
    tags: ['pasta', 'spaghetti', 'italian', 'penne', 'lasagna'],
    photos: ['1608897013039-887f21d8c804', '1621996346565-e3dbc646d9a9', '1551892374-ecf8754cf8b0'],
  },
  {
    key: 'noodles',
    vertical: 'food',
    tags: ['noodles', 'chinese', 'hakka', 'chowmein', 'chow mein', 'fried rice', 'manchurian'],
    photos: ['1565976469782-7c92daebc42e', '1585032226651-759b368d7246', '1612929633738-8fe44f7ec841'],
  },
  {
    key: 'momos',
    vertical: 'food',
    tags: ['momos', 'momo', 'dumplings', 'dimsum', 'dim sum'],
    photos: ['1543198432-a20fa3055570', '1534422298391-e4f8c172dddb', '1694923450868-b432a8ee52aa'],
  },
  {
    key: 'sushi',
    vertical: 'food',
    tags: ['sushi', 'japanese', 'sashimi', 'maki'],
    photos: ['1611143669185-af224c5e3252', '1579871494447-9811cf80d66c', '1553621042-f6e147245754'],
  },
  {
    key: 'ramen',
    vertical: 'food',
    tags: ['ramen', 'bento', 'katsu', 'korean', 'asian'],
    photos: ['1612927601601-6638404737ce', '1614563637806-1d0e645e0940', '1569718212165-3a8278d5f624'],
  },
  {
    key: 'dosa',
    vertical: 'food',
    tags: ['dosa', 'dosas', 'uttapam', 'south indian'],
    photos: ['1668236543090-82eba5ee5976', '1708146464361-5c5ce4f9abb6', '1727404496374-21f174663abb'],
  },
  {
    key: 'idli',
    vertical: 'food',
    tags: ['idli', 'vada', 'sambar', 'south indian breakfast'],
    photos: ['1730191843435-073792ba22bc', '1589301760014-d929f3979dbc', '1680359871322-aabe6b33eff5'],
  },
  {
    key: 'thali',
    vertical: 'food',
    tags: ['thali', 'meals', 'veg meals', 'unlimited meals', 'lunch'],
    photos: ['1742281258189-3b933879867a', '1742281257707-0c7f7e5ca9c6', '1742281257687-092746ad6021'],
  },
  {
    key: 'paneer',
    vertical: 'food',
    tags: ['paneer', 'tikka masala', 'north indian', 'curry', 'dal', 'naan', 'roti', 'veg'],
    photos: ['1588166524941-3bf61a9c41db', '1589647363585-f4a7d3877b10', '1631452180539-96aca7d48617'],
  },
  {
    key: 'seafood',
    vertical: 'food',
    tags: ['fish', 'seafood', 'prawns', 'prawn', 'crab', 'fish fry'],
    photos: ['1761314036936-966ba07ae14b', '1654863404432-cac67587e25d', '1626508035297-0cd27c397d67'],
  },
  {
    key: 'salad',
    vertical: 'food',
    tags: ['salad', 'healthy', 'bowl', 'vegan', 'keto', 'diet'],
    photos: ['1505253716362-afaea1d3d1af', '1512621776951-a57141f2eefd', '1623428187969-5da2dcea5ebf'],
  },
  {
    key: 'pancakes',
    vertical: 'food',
    tags: ['brunch', 'pancakes', 'waffles', 'waffle'],
    photos: ['1611601184963-9d1de9b79ff3', '1528207776546-365bb710ee93', '1541288097308-7b8e3f58c4c6'],
  },
  {
    key: 'breakfast',
    vertical: 'food',
    tags: ['eggs', 'omelette', 'breakfast', 'all-day breakfast', 'toast'],
    photos: ['1712746785691-56d0c0e6e737', '1655979283362-535e6a167a53', '1655979282314-eb45a7d69959'],
  },
  {
    key: 'coffee',
    vertical: 'food',
    tags: ['coffee', 'cappuccino', 'latte', 'espresso', 'cold brew', 'cafe'],
    photos: ['1533776992670-a72f4c28235e', '1587080413959-06b859fb107d', '1630040995437-80b01c5dd52d'],
  },
  {
    key: 'chai',
    vertical: 'food',
    tags: ['tea', 'chai', 'masala chai', 'high tea'],
    photos: ['1630748662359-40a2105640c7', '1732519970445-8f2d6998961f', '1683533698971-dcc5e19cb0f1'],
  },
  {
    key: 'cake',
    vertical: 'food',
    tags: ['cake', 'cakes', 'dessert', 'desserts', 'pastry', 'pastries', 'cheesecake', 'brownie'],
    photos: ['1660383534593-6b5221ab80d2', '1635888070574-beb32aa9b06d', '1615796701805-2094ac54bbf9'],
  },
  {
    key: 'icecream',
    vertical: 'food',
    tags: ['ice cream', 'icecream', 'gelato', 'sundae', 'kulfi'],
    photos: ['1633933358116-a27b902fad35', '1560008581-09826d1de69e', '1570197788417-0e82375c9371'],
  },
  {
    key: 'bakery',
    vertical: 'food',
    tags: ['bakery', 'bread', 'croissant', 'croissants', 'baked'],
    photos: ['1509440159596-0249088772ff', '1608198093002-ad4e005484ec', '1568254183919-78a4f43a2877'],
  },
  {
    key: 'donuts',
    vertical: 'food',
    tags: ['donut', 'donuts', 'doughnut', 'doughnuts'],
    photos: ['1551024601-bec78aea704b', '1527904324834-3bda86da6771', '1527515545081-5db817172677'],
  },
  {
    key: 'juice',
    vertical: 'food',
    tags: ['juice', 'juices', 'smoothie', 'smoothies', 'shake', 'milkshake', 'cold pressed'],
    photos: ['1657101455328-6821c90b0ad3', '1635625894879-c1ead4c93876', '1622597467821-df79dcb4f94d'],
  },
  {
    key: 'beer',
    vertical: 'food',
    tags: ['beer', 'beers', 'pint', 'pitcher', 'pitchers', 'brewery', 'brewpub', 'craft beer', 'pub'],
    photos: ['1687771454203-97d0b08bbeb2', '1612528443702-f6741f70a049', '1615332579037-3c44b3660b53'],
  },
  {
    key: 'cocktails',
    vertical: 'food',
    tags: ['cocktail', 'cocktails', 'mocktail', 'mocktails', 'drinks', 'bar', 'happy hours'],
    photos: ['1702725365144-6e8584ea54e4', '1596463989140-3b600dab72e5', '1598994671512-395d7a6147e0'],
  },
  {
    key: 'wine',
    vertical: 'food',
    tags: ['wine', 'wines', 'sangria'],
    photos: ['1474722883778-792e7990302f', '1660814807979-8482e075420c', '1470158499416-75be9aa0c4db'],
  },
  {
    key: 'feast',
    vertical: 'food',
    tags: ['feast', 'group', 'party', 'sharing', 'family', 'friends', 'buffet', 'platter', 'family dinner'],
    photos: ['1528605248644-14dd04022da1', '1578496780896-7081cc23c111', '1576867757603-05b134ebc379'],
  },
  {
    key: 'dinner',
    vertical: 'food',
    tags: ['dinner', 'date night', 'fine dining', 'candle light', 'couple'],
    photos: ['1574966739987-65e38db0f7ce', '1775340965436-55ddbea71d8f', '1762958118340-6d09cfe236a5'],
  },
  {
    key: 'chaat',
    vertical: 'food',
    tags: ['chaat', 'pani puri', 'golgappa', 'street food', 'samosa', 'pav bhaji', 'vada pav'],
    photos: ['1619193099710-e54f2e2f1b28', '1613292443284-8d10ef9383fe', '1631451457509-454a498df1c0'],
  },
  {
    key: 'sweets',
    vertical: 'food',
    tags: ['sweets', 'mithai', 'laddu', 'jalebi', 'gulab jamun', 'hamper', 'festive'],
    photos: ['1695568181440-aca4dac18650', '1699708263762-00ca477760bd', '1695568180070-8b5acead5cf4'],
  },
  {
    key: 'mutton',
    vertical: 'food',
    tags: ['mutton', 'lamb', 'goat', 'meat', 'rogan josh', 'non-veg'],
    photos: ['1534939561126-855b8675edd7', '1545247181-516773cae754', '1596797038530-2c107229654b'],
  },
  // ---- retail
  {
    key: 'shoes',
    vertical: 'retail',
    tags: ['shoes', 'shoe', 'sneakers', 'running shoes', 'footwear', 'sandals'],
    photos: ['1556906781-9a412961c28c', '1579338559194-a162d19bf842', '1560769629-975ec94e6a86'],
  },
  {
    key: 'fashion',
    vertical: 'retail',
    tags: ['clothes', 'clothing', 'fashion', 'shirt', 'shirts', 'dress', 'dresses', 'apparel', 'kurta', 'jeans', 't-shirt'],
    photos: ['1582719188393-bb71ca45dbb9', '1729487151777-b4be9098ecbb', '1567401893414-76b7b1e5a7a5'],
  },
  {
    key: 'electronics',
    vertical: 'retail',
    tags: ['electronics', 'gadget', 'gadgets', 'tv', 'television', 'camera'],
    photos: ['1620783770629-122b7f187703', '1577048724846-cd9ff1dcacef', '1602526432604-029a709e131c'],
  },
  {
    key: 'phone',
    vertical: 'retail',
    tags: ['phone', 'phones', 'mobile', 'smartphone', 'iphone', 'android', 'screen guard'],
    photos: ['1511707171634-5f897ff02aa9', '1572016047668-5b5e909e1605', '1512941937669-90a1b58e7e9c'],
  },
  {
    key: 'laptop',
    vertical: 'retail',
    tags: ['laptop', 'laptops', 'computer', 'pc', 'macbook', 'ssd'],
    photos: ['1541807084-5c52b6b3adef', '1484788984921-03950022c9ef', '1486312338219-ce68d2c6f44d'],
  },
  {
    key: 'audio',
    vertical: 'retail',
    tags: ['headphones', 'earbuds', 'earphones', 'audio', 'speaker', 'speakers'],
    photos: ['1572569511254-d8f925fe2cbb', '1590658268037-6bf12165a8df', '1606220588913-b3aacb4d2f46'],
  },
  {
    key: 'watch',
    vertical: 'retail',
    tags: ['watch', 'watches', 'smartwatch'],
    photos: ['1524592094714-0f0654e20314', '1619976491498-f2dadb25fb3b', '1620625515032-6ed0c1790c75'],
  },
  {
    key: 'grocery',
    vertical: 'retail',
    tags: ['grocery', 'groceries', 'vegetables', 'veggies', 'fruits', 'organic', 'kirana', 'supermarket'],
    photos: ['1557844352-761f2565b576', '1591586116988-62fe65164f8d', '1550989460-0adf9ea622e2'],
  },
  {
    key: 'books',
    vertical: 'retail',
    tags: ['book', 'books', 'bookstore', 'stationery'],
    photos: ['1462392627162-2baa2b3518a8', '1623771702313-39dc4f71d275', '1643250048998-7ffa83ae2c63'],
  },
  {
    key: 'jewellery',
    vertical: 'retail',
    tags: ['jewellery', 'jewelry', 'gold', 'ring', 'rings', 'necklace', 'earrings', 'silver'],
    photos: ['1569397288884-4d43d6738fbd', '1543294001-f7cd5d7fb516', '1601121141461-9d6647bca1ed'],
  },
  {
    key: 'beauty',
    vertical: 'retail',
    tags: ['cosmetics', 'skincare', 'beauty', 'perfume', 'lipstick', 'serum'],
    photos: ['1600634999623-864991678406', '1601049413574-214d105b26e4', '1629198688000-71f23e745b6e'],
  },
  {
    key: 'furniture',
    vertical: 'retail',
    tags: ['furniture', 'sofa', 'decor', 'home decor', 'mattress', 'chair'],
    photos: ['1512212621149-107ffe572d2f', '1555041469-a586c61ea9bc', '1696778382623-8e2d2743df28'],
  },
  {
    key: 'sports',
    vertical: 'retail',
    tags: ['sports', 'cricket', 'football', 'badminton', 'racket', 'yoga mat', 'yoga mats'],
    photos: ['1562771242-a02d9090c90c', '1602211844066-d3bb556e983b', '1646504632442-6cacb1858bd6'],
  },
  {
    key: 'toys',
    vertical: 'retail',
    tags: ['toy', 'toys', 'kids', 'games'],
    photos: ['1587654780291-39c9404d746b', '1596461404969-9ae70f2830c1', '1558060370-d644479cb6f7'],
  },
  {
    key: 'eyewear',
    vertical: 'retail',
    tags: ['glasses', 'sunglasses', 'eyewear', 'spectacles', 'lenses'],
    photos: ['1610136649349-0f646f318053', '1608539733292-190446b22b83', '1589642380614-4a8c2147b857'],
  },
  {
    key: 'bags',
    vertical: 'retail',
    tags: ['bag', 'bags', 'backpack', 'luggage', 'handbag', 'wallet'],
    photos: ['1605733513597-a8f8341084e6', '1622560481979-f5b0174242a0', '1509762774605-f07235a08f1f'],
  },
  {
    key: 'riding-gear',
    vertical: 'retail',
    tags: ['helmet', 'riding gear', 'riding jacket', 'gloves', 'jacket'],
    photos: ['1591260035149-2829f11fdefe', '1746711781900-242d46d549a8', '1611004061856-ccc3cbe944b2'],
  },
  // ---- events
  {
    key: 'comedy',
    vertical: 'events',
    tags: ['comedy', 'stand-up', 'standup', 'stand up', 'open mic', 'improv', 'comic'],
    photos: ['1647589047037-ba94e650388f', '1580188928585-0ef5c1a5c4dd', '1728674115193-6febdf9fe365'],
  },
  {
    key: 'concert',
    vertical: 'events',
    tags: ['concert', 'live music', 'gig', 'band', 'music', 'festival'],
    photos: ['1565035010268-a3816f98589a', '1603190287605-e6ade32fa852', '1540039155733-5bb30b53aa14'],
  },
  {
    key: 'nightlife',
    vertical: 'events',
    tags: ['dj', 'nightlife', 'club', 'night', 'party', 'techno'],
    photos: ['1583906326458-5eb89bf0f911', '1618176581836-9dcf475e2b4a', '1574155376612-bfa4ed8aabfd'],
  },
  {
    key: 'pottery',
    vertical: 'events',
    tags: ['pottery', 'clay', 'ceramics'],
    photos: ['1609881583302-61548332039c', '1607556672044-6110fc499247', '1607556671927-78a6605e290b'],
  },
  {
    key: 'painting',
    vertical: 'events',
    tags: ['painting', 'art', 'watercolour', 'watercolor', 'canvas', 'sketching'],
    photos: ['1609174112693-52fdcebffd89', '1578961140619-896df05b1fd2', '1658303135227-fcdfb0dab396'],
  },
  {
    key: 'dance',
    vertical: 'events',
    tags: ['dance', 'salsa', 'zumba', 'bollywood dance', 'hip hop'],
    photos: ['1537365587684-f490102e1225', '1524594152303-9fd13543fe6e', '1604954055722-7f80571fbfc3'],
  },
  {
    key: 'cooking',
    vertical: 'events',
    tags: ['cooking class', 'baking class', 'cooking', 'chef'],
    photos: ['1683105555403-4c4cae4e2298', '1556910103-1c02745aae4d', '1683624328172-88fb24625ec1'],
  },
  {
    key: 'kids',
    vertical: 'events',
    tags: ['kids', 'children', 'play', 'summer camp', 'birthday'],
    photos: ['1627373369501-413bfb9435d9', '1596464716127-f2a82984de30', '1579018024219-fa9694ca5698'],
  },
  {
    key: 'cinema',
    vertical: 'events',
    tags: ['movie', 'movies', 'cinema', 'film', 'screening'],
    photos: ['1688678004647-945d5aaf91c1', '1668890094751-6986d0ca9dfc', '1608170825938-a8ea0305d46c'],
  },
  {
    key: 'meetup',
    vertical: 'events',
    tags: ['meetup', 'conference', 'talk', 'networking', 'seminar', 'startup'],
    photos: ['1559223607-a43c990c692c', '1576085898323-218337e3e43c', '1587825140708-dfaf72ae4b04'],
  },
  {
    key: 'volunteer',
    vertical: 'events',
    tags: ['volunteer', 'volunteering', 'cleanup', 'clean-up', 'plantation', 'ngo'],
    photos: ['1758599668299-beebedfabf7b', '1758599669266-8036ddafdb63', '1616680214084-22670de1bc82'],
  },
  {
    key: 'classroom',
    vertical: 'events',
    tags: ['class', 'classes', 'course', 'language', 'tutoring', 'coaching', 'kannada', 'workshop'],
    photos: ['1581726707445-75cbe4efc586', '1561089489-f13d5e730d72', '1577896851231-70ef18881754'],
  },
  {
    key: 'guitar',
    vertical: 'events',
    tags: ['guitar', 'music class', 'piano', 'ukulele', 'drums'],
    photos: ['1525201548942-d8732f6617a0', '1536594527669-2f555de54e95', '1588450523206-e0b048d8f4d3'],
  },
  {
    key: 'trek',
    vertical: 'events',
    tags: ['trek', 'trekking', 'hike', 'hiking', 'camping', 'outdoor', 'nandi hills'],
    photos: ['1593739742226-5e5e2fdb1f1c', '1503789597747-41de608aca69', '1606262482703-496941e54337'],
  },
  // ---- services
  {
    key: 'haircut',
    vertical: 'services',
    tags: ['haircut', 'hair cut', 'barber', 'salon', 'hair', 'beard', 'styling'],
    photos: ['1647140655214-e4a2d914971f', '1635273051937-a0ddef9573b6', '1605497788044-5a32c7078486'],
  },
  {
    key: 'spa',
    vertical: 'services',
    tags: ['spa', 'massage', 'body massage', 'aromatherapy'],
    photos: ['1696841212541-449ca29397cc', '1741522509438-a120c0bb5e88', '1544161515-4ab6ce6db874'],
  },
  {
    key: 'facial',
    vertical: 'services',
    tags: ['facial', 'skin', 'cleanup', 'glow', 'hydra', 'dermatology'],
    photos: ['1616394584738-fc6e612e71b9', '1570172619644-dfd03ed5d881', '1761718210089-ba3bb5ccb54f'],
  },
  {
    key: 'makeup',
    vertical: 'services',
    tags: ['makeup', 'make-up', 'bridal', 'bride', 'party makeup'],
    photos: ['1602910344008-22f323cc1817', '1709477542149-f4e0e21d590b', '1709477542170-f11ee7d471a0'],
  },
  {
    key: 'nails',
    vertical: 'services',
    tags: ['nails', 'nail', 'manicure', 'pedicure', 'nail art'],
    photos: ['1519014816548-bf5fe059798b', '1632345031435-8727f6897d53', '1690749138086-7422f71dc159'],
  },
  {
    key: 'gym',
    vertical: 'services',
    tags: ['gym', 'fitness', 'workout', 'weights', 'membership', 'strength'],
    photos: ['1548690312-e3b507d8c110', '1583454110551-21f2fa2afe61', '1517836357463-d25dfeac3438'],
  },
  {
    key: 'yoga',
    vertical: 'services',
    tags: ['yoga', 'meditation', 'pilates'],
    photos: ['1730672786064-c0836eeb41c2', '1588286840104-8957b019727f', '1651077837628-52b3247550ae'],
  },
  {
    key: 'trainer',
    vertical: 'services',
    tags: ['trainer', 'personal training', 'crossfit', 'coach'],
    photos: ['1571732154690-f6d1c3e5178a', '1648542036561-e1d66a5ae2b1', '1571019614242-c5c5dee9f50b'],
  },
  {
    key: 'cleaning',
    vertical: 'services',
    tags: ['cleaning', 'deep clean', 'deep cleaning', 'housekeeping', 'sofa cleaning', 'bathroom cleaning'],
    photos: ['1585421514284-efb74c2b69ba', '1758523670739-0d26a3ee976d', '1740657254989-42fe9c3b8cce'],
  },
  {
    key: 'ac-repair',
    vertical: 'services',
    tags: ['ac', 'air conditioner', 'appliance', 'appliance repair', 'fridge', 'washing machine'],
    photos: ['1591357167522-61d54313c8a4', '1657653464580-2badf3d09040', '1701058666995-07adcef94170'],
  },
  {
    key: 'plumber',
    vertical: 'services',
    tags: ['plumber', 'plumbing', 'leak', 'tap'],
    photos: ['1676210133055-eab6ef033ce3', '1676210134050-6f12c6898395', '1596394723269-b2cbca4e6313'],
  },
  {
    key: 'electrician',
    vertical: 'services',
    tags: ['electrician', 'wiring', 'electrical', 'fan', 'inverter'],
    photos: ['1621905251189-08b45d6a269e', '1660330589693-99889d60181e', '1601462904263-f2fa0c851cb9'],
  },
  {
    key: 'pest',
    vertical: 'services',
    tags: ['pest control', 'pest', 'termite', 'cockroach'],
    photos: ['1747659629851-a92bd71149f6', '1581578405048-b6f813432ca4', '1581578017093-cd30fce4eeb7'],
  },
  {
    key: 'laundry',
    vertical: 'services',
    tags: ['laundry', 'dry clean', 'dry cleaning', 'ironing', 'wash and fold'],
    photos: ['1567113463300-102a7eb3cb26', '1696546761269-a8f9d2b80512', '1604335398980-ededcadcc37d'],
  },
  {
    key: 'car-wash',
    vertical: 'services',
    tags: ['car wash', 'car cleaning', 'detailing', 'foam wash', 'car interior'],
    photos: ['1608506375591-b90e1f955e4b', '1565689876697-e467b6c54da2', '1543857182-68106299b6b2'],
  },
  {
    key: 'car-service',
    vertical: 'services',
    tags: ['car service', 'car repair', 'mechanic', 'garage', 'periodic service', 'oil change', 'car', 'sedan', 'suv', 'hatchback'],
    photos: ['1625047509248-ec889cbff17f', '1615906655593-ad0386982a0f', '1643700973089-baa86a1ab9ee'],
  },
  {
    key: 'bike-service',
    vertical: 'services',
    tags: ['bike service', 'motorcycle repair', 'two wheeler', 'bike repair', 'scooter service', 'bike wash', 'bike', 'motorcycle', 'scooter', 'scooty', 'activa', 'royal enfield', 'enfield', 'bullet', 'touring kit', 'chain'],
    photos: ['1650569663338-f6921d483868', '1517524206127-48bbd363f3d7', '1650569663281-44a28c984e2a'],
  },
  {
    key: 'tyres',
    vertical: 'services',
    tags: ['tyre', 'tyres', 'tire', 'wheel alignment', 'balancing', 'puncture'],
    photos: ['1578844251758-2f71da64c96f', '1599082267768-4815b2ea6bd2', '1444947295498-07f60c19a4ff'],
  },
  {
    key: 'pets',
    vertical: 'services',
    tags: ['pet', 'pets', 'dog', 'cat', 'grooming', 'vet'],
    photos: ['1611173622933-91942d394b04', '1625321171045-1fea4ac688e9', '1719464454959-9cf304ef4774'],
  },
  {
    key: 'photography',
    vertical: 'services',
    tags: ['photography', 'photoshoot', 'photographer', 'pre-wedding'],
    photos: ['1549981832-2ba2ee913334', '1542992933-ce75d0187ec1', '1512813498716-3e640fed3f39'],
  },
  {
    key: 'dental',
    vertical: 'services',
    tags: ['dental', 'dentist', 'teeth', 'checkup', 'clinic', 'health'],
    photos: ['1662837625421-5fd8ed6131a0', '1663185551550-f8f56529ac5e', '1643660526741-094639fbe53a'],
  },
  {
    key: 'tailor',
    vertical: 'services',
    tags: ['tailor', 'tailoring', 'stitching', 'alteration', 'blouse'],
    photos: ['1606501126768-b78d4569d3f9', '1533758488827-1ed0f9b03899', '1578353022142-09264fd64295'],
  },
  // ---- mobility
  {
    key: 'cab',
    vertical: 'mobility',
    tags: ['cab', 'cabs', 'taxi', 'airport', 'ride', 'rides', 'sedan', 'suv'],
    photos: ['1610886023290-6ba32b20e354', '1556122071-e404eaedb77f', '1449965408869-eaa3f722e40d'],
  },
  {
    key: 'motorcycle',
    vertical: 'mobility',
    tags: ['bike rental', 'motorcycle', 'royal enfield', 'bullet', 'bike', 'bikes', 'ride'],
    photos: ['1622185135505-2d795003994a', '1650206748193-a7a970c833da', '1544368200-c30c22b3d7c7'],
  },
  {
    key: 'scooter',
    vertical: 'mobility',
    tags: ['scooter', 'scooty', 'activa', 'scooters', 'two wheeler'],
    photos: ['1503434396599-58ba8a18d932', '1554223789-df81106a45ed', '1558981403-c5f9899a28bc'],
  },
  {
    key: 'bicycle',
    vertical: 'mobility',
    tags: ['bicycle', 'cycle', 'cycling', 'ebike', 'e-bike', 'electric bike'],
    photos: ['1602517232715-c4a366f0ce1b', '1726543638998-f792eb7d081a', '1584278140365-2ab8bff2be82'],
  },
  {
    key: 'road-trip',
    vertical: 'mobility',
    tags: ['car rental', 'self drive', 'road trip', 'outstation', 'trip', 'weekend getaway'],
    photos: ['1532931899774-fbd4de0008fb', '1526478512290-5397e7d2ca6a', '1578158335529-27b8d78cfea5'],
  },
  // ---- property
  {
    key: 'apartment',
    vertical: 'property',
    tags: ['flat', 'flats', 'apartment', '1bhk', '2bhk', '3bhk', 'bhk', 'rent', 'furnished'],
    photos: ['1613575831056-0acd5da8f085', '1665249934445-1de680641f50', '1612419299101-6c294dc2901d'],
  },
  {
    key: 'villa',
    vertical: 'property',
    tags: ['villa', 'villas', 'house', 'independent house', 'bungalow', 'garden'],
    photos: ['1717167398817-121e3c283dbb', '1616012760010-8da02da071fd', '1670589953882-b94c9cb380f5'],
  },
  {
    key: 'pg-room',
    vertical: 'property',
    tags: ['pg', 'room', 'rooms', 'coliving', 'co-living', 'hostel', 'single room', 'sharing'],
    photos: ['1781415980730-bfcf192e38bc', '1555854877-bab0e564b8d5', '1709805619372-40de3f158e83'],
  },
  {
    key: 'office-space',
    vertical: 'property',
    tags: ['office', 'office space', 'commercial', 'shop'],
    photos: ['1718220216044-006f43e3a9b1', '1631193816258-28b44b21e78b', '1556761175-4b46a572b786'],
  },
  // ---- business
  {
    key: 'coworking',
    vertical: 'business',
    tags: ['coworking', 'co-working', 'desk', 'hot desk', 'workspace', 'cabin'],
    photos: ['1604328703693-18313fe20f3a', '1604328698692-f76ea9498e76', '1527192491265-7e15c55b1ed2'],
  },
  {
    key: 'printing',
    vertical: 'business',
    tags: ['printing', 'print', 'visiting cards', 'business cards', 'banners', 'signage', 'flex'],
    photos: ['1561015314-6bd8c1e875ee', '1422036306541-00138cae4dbc', '1599590984817-0c15f31b1fa5'],
  },
  {
    key: 'meeting',
    vertical: 'business',
    tags: ['meeting room', 'conference room', 'boardroom'],
    photos: ['1431540015161-0bf868a2d407', '1571624436279-b272aff752b5', '1631246957572-0c49e4ee6ff4'],
  },
  {
    key: 'marketing',
    vertical: 'business',
    tags: ['website', 'marketing', 'social media', 'seo', 'digital', 'design'],
    photos: ['1542744173-05336fcc7ad4', '1759215524484-89c8d7ae28f2', '1557838923-2985c318be48'],
  },
];
